// @ts-nocheck
// app/api/admin/document-sweep/route.ts
//
// Admin-triggered sweep for stranded files in the learner-documents bucket.
//
// The learner course-page upload flow (DocumentUploadBlock) uploads the file
// to storage first, then saves the learner_documents record. If the record
// save fails, the client calls /api/document-cleanup — but if the learner
// closes the tab between the upload and the save, no cleanup ever runs and
// the file stays stranded. This sweep covers that gap.
//
// Safety guarantees:
//   - Admin-only (has_role check server-side; service-role client is used
//     only after the role check passes).
//   - Only objects older than a safety window (default 24h) are considered,
//     so in-flight uploads are never raced.
//   - A file is deleted ONLY if no learner_documents row references its
//     file_path — any status (active, replaced, archived, ...) counts as
//     referenced. Fail closed: if a reference check errors, that batch is
//     skipped, never deleted.
//   - Pass { dryRun: true } to see what would be deleted without deleting.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "learner-documents";
const DEFAULT_SAFETY_WINDOW_HOURS = 24;
// Never allow the window below 24h (protects in-flight uploads) or above
// 1 year (keeps the cutoff Date valid).
const MIN_SAFETY_WINDOW_HOURS = 24;
const MAX_SAFETY_WINDOW_HOURS = 24 * 365;
// Keep .in() lists well under Supabase URL length limits.
const REF_CHECK_CHUNK = 150;
const LIST_PAGE_SIZE = 1000;

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

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    // The safety window can be widened (more conservative) but never
    // narrowed below the 24h minimum, and is capped so the cutoff Date
    // always stays valid. Anything non-numeric falls back to the default.
    const requested = Number(body?.safetyWindowHours);
    const safetyWindowHours = Number.isFinite(requested)
      ? Math.min(Math.max(requested, MIN_SAFETY_WINDOW_HOURS), MAX_SAFETY_WINDOW_HOURS)
      : DEFAULT_SAFETY_WINDOW_HOURS;
    const cutoff = new Date(Date.now() - safetyWindowHours * 60 * 60 * 1000);
    if (isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: "Invalid safety window" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Bucket layout is `${userId}/${filename}` — top-level entries are user
    // folders (no created_at/id since they are prefixes, not objects).
    const topLevel = await listFolder(admin, "");
    const folders = topLevel.filter((e) => e && e.name && e.id == null);

    // Collect candidate file paths: real objects older than the safety window.
    const candidates: string[] = [];
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
        candidates.push(`${folder.name}/${obj.name}`);
      }
    }

    // Filter out anything referenced by a learner_documents row (any status).
    // Fail closed per chunk: a failed reference check skips that chunk.
    const unreferenced: string[] = [];
    let refCheckErrors = 0;
    for (const batch of chunk(candidates, REF_CHECK_CHUNK)) {
      const { data: refRows, error: refError } = await admin
        .from("learner_documents")
        .select("file_path")
        .in("file_path", batch);
      if (refError) {
        console.error("[document-sweep] reference check failed, skipping batch:", refError);
        refCheckErrors++;
        continue;
      }
      const referenced = new Set((refRows ?? []).map((r) => r.file_path));
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

    return NextResponse.json({
      success: true,
      dryRun,
      safetyWindowHours,
      scanned,
      candidatesOlderThanWindow: candidates.length,
      unreferenced: unreferenced.length,
      deleted: dryRun ? [] : deleted,
      deletedCount: dryRun ? 0 : deleted.length,
      wouldDelete: dryRun ? unreferenced : undefined,
      refCheckErrors,
      deleteErrors,
    });
  } catch (e) {
    console.error("[document-sweep] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
