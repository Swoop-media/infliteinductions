// @ts-nocheck
// lib/document-sweep.ts
//
// Shared sweep logic for stranded files in the learner-documents bucket.
// Used by both the admin-triggered route (/api/admin/document-sweep) and the
// scheduled cron route (/api/cron/document-sweep).
//
// The learner course-page upload flow (DocumentUploadBlock) uploads the file
// to storage first, then saves the learner_documents record. If the record
// save fails, the client calls /api/document-cleanup — but if the learner
// closes the tab between the upload and the save, no cleanup ever runs and
// the file stays stranded. This sweep covers that gap.
//
// Safety guarantees:
//   - Only objects older than a safety window (default 24h, never less) are
//     considered, so in-flight uploads are never raced.
//   - A file is deleted ONLY if no learner_documents row references its
//     file_path — any status (active, replaced, archived, ...) counts as
//     referenced. Fail closed: if a reference check errors, that batch is
//     skipped, never deleted.
//   - Pass { dryRun: true } to see what would be deleted without deleting.

import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "learner-documents";
const DEFAULT_SAFETY_WINDOW_HOURS = 24;
// Never allow the window below 24h (protects in-flight uploads) or above
// 1 year (keeps the cutoff Date valid).
const MIN_SAFETY_WINDOW_HOURS = 24;
const MAX_SAFETY_WINDOW_HOURS = 24 * 365;
// Keep .in() lists well under Supabase URL length limits.
const REF_CHECK_CHUNK = 150;
const LIST_PAGE_SIZE = 1000;

export type ReviewedDeletionResult = {
  success: true;
  safetyWindowHours: number;
  requested: number;
  deleted: string[];
  deletedCount: number;
  /** Paths that were NOT deleted, with the reason each was spared. */
  skipped: { path: string; reason: string }[];
  deleteErrors: string[];
};

export type DocumentSweepResult = {
  success: true;
  dryRun: boolean;
  safetyWindowHours: number;
  scanned: number;
  candidatesOlderThanWindow: number;
  unreferenced: number;
  deleted: string[];
  deletedCount: number;
  wouldDelete?: string[];
  /** Per-file detail for review UIs (dry run only): when the file was uploaded. */
  wouldDeleteDetails?: { path: string; createdAt: string | null }[];
  refCheckErrors: number;
  deleteErrors: string[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** List every object in a folder (paginated). Returns entries with name + created_at. */
async function listFolder(admin, folder: string) {
  const entries = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(folder, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`storage list failed for "${folder}": ${error.message}`);
    entries.push(...(data ?? []));
    if (!data || data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }
  return entries;
}

/**
 * Run the stranded-file sweep. Callers are responsible for authorization
 * (admin role check or cron secret) BEFORE calling this — it uses the
 * service-role client unconditionally.
 */
function clampSafetyWindow(requestedRaw: unknown): number {
  const requested = Number(requestedRaw);
  return Number.isFinite(requested)
    ? Math.min(Math.max(requested, MIN_SAFETY_WINDOW_HOURS), MAX_SAFETY_WINDOW_HOURS)
    : DEFAULT_SAFETY_WINDOW_HOURS;
}

/**
 * Delete ONLY the explicitly reviewed paths, never rediscovering new
 * candidates. Each path is revalidated immediately before removal:
 *   - it must still exist in storage and be older than the safety window;
 *   - it must still have no learner_documents reference (raw or
 *     bucket-prefixed form).
 * Anything failing revalidation is skipped with a reason. Callers are
 * responsible for authorization BEFORE calling this.
 */
export async function deleteReviewedFiles(
  paths: string[],
  opts?: { safetyWindowHours?: number }
): Promise<ReviewedDeletionResult> {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("No paths provided");
  }
  if (paths.length > 5000) {
    throw new Error("Too many paths");
  }
  // Sanitize: expect "folder/filename" storage-relative paths only.
  const cleaned = [...new Set(paths)].filter(
    (p) =>
      typeof p === "string" &&
      p.length > 0 &&
      !p.startsWith("/") &&
      !p.includes("..") &&
      p.includes("/")
  );

  const safetyWindowHours = clampSafetyWindow(opts?.safetyWindowHours);
  const cutoff = new Date(Date.now() - safetyWindowHours * 60 * 60 * 1000);
  if (isNaN(cutoff.getTime())) throw new Error("Invalid safety window");

  const admin = supabaseAdmin();
  const skipped: { path: string; reason: string }[] = [];
  for (const p of paths) {
    if (!cleaned.includes(p)) skipped.push({ path: String(p), reason: "invalid path" });
  }

  // Re-check existence + age: list each involved folder once.
  const folders = [...new Set(cleaned.map((p) => p.slice(0, p.indexOf("/"))))];
  const createdAtByPath = new Map<string, Date | null>();
  for (const folder of folders) {
    const objects = await listFolder(admin, folder);
    for (const obj of objects) {
      if (!obj || obj.id == null) continue;
      const createdAt = obj.created_at ? new Date(obj.created_at) : null;
      createdAtByPath.set(
        `${folder}/${obj.name}`,
        createdAt && !isNaN(createdAt.getTime()) ? createdAt : null
      );
    }
  }

  const ageOk: string[] = [];
  for (const p of cleaned) {
    if (!createdAtByPath.has(p)) {
      skipped.push({ path: p, reason: "no longer exists in storage" });
      continue;
    }
    const createdAt = createdAtByPath.get(p);
    if (!createdAt || createdAt > cutoff) {
      skipped.push({ path: p, reason: "newer than the safety window" });
      continue;
    }
    ageOk.push(p);
  }

  // Re-check references (fail closed per chunk). Halved chunk size: each
  // path is looked up in raw and bucket-prefixed form.
  const deletable: string[] = [];
  for (const batch of chunk(ageOk, Math.max(1, Math.floor(REF_CHECK_CHUNK / 2)))) {
    const lookupPaths = batch.flatMap((p) => [p, `${BUCKET}/${p}`]);
    const { data: refRows, error: refError } = await admin
      .from("learner_documents")
      .select("file_path")
      .in("file_path", lookupPaths);
    if (refError) {
      console.error("[document-sweep] reviewed-delete reference check failed, skipping batch:", refError);
      for (const p of batch) skipped.push({ path: p, reason: "reference check failed (skipped for safety)" });
      continue;
    }
    const referenced = new Set(
      (refRows ?? []).map((r) =>
        r.file_path?.startsWith(`${BUCKET}/`) ? r.file_path.slice(BUCKET.length + 1) : r.file_path
      )
    );
    for (const p of batch) {
      if (referenced.has(p)) skipped.push({ path: p, reason: "now referenced by a document record" });
      else deletable.push(p);
    }
  }

  const deleted: string[] = [];
  const deleteErrors: string[] = [];
  for (const batch of chunk(deletable, REF_CHECK_CHUNK)) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove(batch);
    if (removeError) {
      console.error("[document-sweep] reviewed-delete storage remove failed:", removeError);
      deleteErrors.push(removeError.message ?? "unknown error");
      continue;
    }
    deleted.push(...batch);
  }

  return {
    success: true,
    safetyWindowHours,
    requested: paths.length,
    deleted,
    deletedCount: deleted.length,
    skipped,
    deleteErrors,
  };
}

export async function runDocumentSweep(opts?: {
  dryRun?: boolean;
  safetyWindowHours?: number;
}): Promise<DocumentSweepResult> {
  const dryRun = opts?.dryRun === true;
  // The safety window can be widened (more conservative) but never
  // narrowed below the 24h minimum, and is capped so the cutoff Date
  // always stays valid. Anything non-numeric falls back to the default.
  const safetyWindowHours = clampSafetyWindow(opts?.safetyWindowHours);
  const cutoff = new Date(Date.now() - safetyWindowHours * 60 * 60 * 1000);
  if (isNaN(cutoff.getTime())) {
    throw new Error("Invalid safety window");
  }

  const admin = supabaseAdmin();

  // Bucket layout is `${userId}/${filename}` — top-level entries are user
  // folders (no created_at/id since they are prefixes, not objects).
  const topLevel = await listFolder(admin, "");
  const folders = topLevel.filter((e) => e && e.name && e.id == null);

  // Collect candidate file paths: real objects older than the safety window.
  const candidates: string[] = [];
  const createdAtByPath = new Map<string, string | null>();
  let scanned = 0;
  for (const folder of folders) {
    const objects = await listFolder(admin, folder.name);
    for (const obj of objects) {
      if (!obj || obj.id == null) continue; // sub-prefix, not an object
      if (obj.name === ".emptyFolderPlaceholder") continue;
      scanned++;
      const createdAt = obj.created_at ? new Date(obj.created_at) : null;
      // Fail closed: if we can't determine age, do not treat as stale.
      if (!createdAt || isNaN(createdAt.getTime()) || createdAt > cutoff) continue;
      const path = `${folder.name}/${obj.name}`;
      candidates.push(path);
      createdAtByPath.set(path, obj.created_at ?? null);
    }
  }

  // Filter out anything referenced by a learner_documents row (any status).
  // Fail closed per chunk: a failed reference check skips that chunk.
  const unreferenced: string[] = [];
  let refCheckErrors = 0;
  // Halve the chunk size: each batch is looked up in two forms (raw and
  // bucket-prefixed), and the combined .in() list must stay within the
  // ~150-value URL-length limit that Supabase queries can safely handle.
  for (const batch of chunk(candidates, Math.max(1, Math.floor(REF_CHECK_CHUNK / 2)))) {
    // Legacy rows stored file_path with the bucket name prefixed
    // (e.g. "learner-documents/<uid>/<file>"), so match both forms.
    // A prefix-only match once caused referenced files to be deleted.
    const lookupPaths = batch.flatMap((p) => [p, `${BUCKET}/${p}`]);
    const { data: refRows, error: refError } = await admin
      .from("learner_documents")
      .select("file_path")
      .in("file_path", lookupPaths);
    if (refError) {
      console.error("[document-sweep] reference check failed, skipping batch:", refError);
      refCheckErrors++;
      continue;
    }
    const referenced = new Set(
      (refRows ?? []).map((r) =>
        r.file_path?.startsWith(`${BUCKET}/`) ? r.file_path.slice(BUCKET.length + 1) : r.file_path
      )
    );
    for (const path of batch) {
      if (!referenced.has(path)) unreferenced.push(path);
    }
  }

  // Delete the stranded files (unless dry run).
  const deleted: string[] = [];
  const deleteErrors: string[] = [];
  if (!dryRun) {
    for (const batch of chunk(unreferenced, REF_CHECK_CHUNK)) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(batch);
      if (removeError) {
        console.error("[document-sweep] storage remove failed for batch:", removeError);
        deleteErrors.push(removeError.message ?? "unknown error");
        continue;
      }
      deleted.push(...batch);
    }
  }

  return {
    success: true,
    dryRun,
    safetyWindowHours,
    scanned,
    candidatesOlderThanWindow: candidates.length,
    unreferenced: unreferenced.length,
    deleted: dryRun ? [] : deleted,
    deletedCount: dryRun ? 0 : deleted.length,
    wouldDelete: dryRun ? unreferenced : undefined,
    wouldDeleteDetails: dryRun
      ? unreferenced.map((p) => ({ path: p, createdAt: createdAtByPath.get(p) ?? null }))
      : undefined,
    refCheckErrors,
    deleteErrors,
  };
}
