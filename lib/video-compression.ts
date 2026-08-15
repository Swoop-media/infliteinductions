// @ts-nocheck
// lib/video-compression.ts
//
// Background re-encode of oversized module videos. Uploads to module-videos/
// over COMPRESSION_THRESHOLD_BYTES are queued (video_compression_jobs table)
// by /api/upload-complete and processed here: download via signed URL,
// re-encode to 1080p H.264 CRF23 AAC +faststart with ffmpeg, and replace the
// object at the same storage path (streamed signed-URL upload — supabase-js
// .upload() with large Buffers fails with a bare "fetch failed").
//
// Constraints honoured (see .agents/memory):
// - Never leave MP4 bytes under a .webm path: the file proxy picks
//   Content-Type by extension and iOS rejects mislabeled webm. For .webm
//   sources we upload a sibling .mp4 path, repoint the video block, then
//   remove the old object.
// - Single-flight, sequential processing: this runs on a 1 vCPU Reserved VM
//   (one Node process), so an in-memory lock is sufficient and encoding is
//   run through `nice` so it can't starve request handling.
// - Every outbound fetch has a hard timeout and bodies are always consumed
//   or cancelled (outbound fetch hygiene rules).
// - Degrades gracefully when the queue table hasn't been migrated yet:
//   enqueue failures are logged, uploads are never blocked.

import { createSupabaseService } from "@/lib/supabase/service";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const execFileAsync = promisify(execFile);

export const COMPRESSION_THRESHOLD_BYTES = 100 * 1024 * 1024; // ~100MB

const BUCKET = "course-files";
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000; // streamed download of up to 300MB
const UPLOAD_TIMEOUT_MS = 30 * 60_000;
const ENCODE_TIMEOUT_MS = 90 * 60_000; // niced encode of a 300MB video can be slow on 1 vCPU
const STALL_REQUEUE_MS = 3 * 60 * 60_000; // processing rows older than 3h are considered crashed
const MAX_ATTEMPTS = 3;
const MAX_JOBS_PER_RUN = 5;

// In-memory single-flight lock. Valid because a Reserved VM runs exactly one
// Node process; prevents the upload-complete kick and the cron pickup from
// running two ffmpeg encodes at once.
let workerBusy = false;

/**
 * Queue a compression job for an oversized module video. Never throws —
 * uploads must not be blocked by compression bookkeeping. Returns true when
 * a job was queued.
 */
export async function enqueueVideoCompression(opts: {
  storagePath: string;
  blockId?: string | null;
  moduleId?: string | null;
  originalBytes?: number | null;
  uploadedBy?: string | null;
}): Promise<boolean> {
  try {
    const admin = createSupabaseService();
    // Skip when an active job already exists for this path.
    const { data: existing, error: existingErr } = await admin
      .from("video_compression_jobs")
      .select("id")
      .eq("storage_path", opts.storagePath)
      .in("status", ["queued", "processing"])
      .limit(1);
    if (existingErr) throw existingErr;
    if (existing?.length) return false;

    const baseRow = {
      storage_path: opts.storagePath,
      block_id: opts.blockId ?? null,
      module_id: opts.moduleId ?? null,
      original_bytes: opts.originalBytes ?? null,
      status: "queued",
    };
    let { error } = await admin
      .from("video_compression_jobs")
      .insert({ ...baseRow, uploaded_by: opts.uploadedBy ?? null });
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      // uploaded_by column missing (migration 030 not applied yet) — queue the
      // job anyway; the uploader notification is skipped for such jobs.
      console.warn(
        "[video-compress] uploaded_by column missing (apply migration 030); queuing without it"
      );
      ({ error } = await admin.from("video_compression_jobs").insert(baseRow));
    }
    if (error) throw error;
    console.log(`[video-compress] queued ${opts.storagePath} (${opts.originalBytes ? (opts.originalBytes / 1e6).toFixed(0) + " MB" : "size unknown"})`);
    return true;
  } catch (e: any) {
    // PGRST205 = table missing (migration not applied yet) — degrade gracefully.
    console.error(
      `[video-compress] enqueue failed for ${opts.storagePath} (upload unaffected):`,
      e?.message || e
    );
    return false;
  }
}

/**
 * Fire-and-forget kick of the queue worker. Safe to call from request
 * handlers; returns immediately.
 */
export function kickVideoCompressionWorker(): void {
  processVideoCompressionQueue().catch((e) =>
    console.error("[video-compress] worker run failed:", e?.message || e)
  );
}

/**
 * Process queued jobs sequentially until the queue is empty (bounded per
 * run). Single-flight: concurrent calls return immediately.
 */
export async function processVideoCompressionQueue(): Promise<{
  ran: boolean;
  processed: number;
}> {
  if (workerBusy) return { ran: false, processed: 0 };
  workerBusy = true;
  let processed = 0;
  try {
    const admin = createSupabaseService();
    await requeueStalledJobs(admin);

    for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
      const { data: jobs, error } = await admin
        .from("video_compression_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) {
        // Table missing (migration not applied) or transient — stop quietly.
        console.error("[video-compress] queue read failed:", error.message);
        break;
      }
      const job = jobs?.[0];
      if (!job) break;

      // Claim the job; guard against a competing claim (shouldn't happen in
      // one process, but the update-where-status pattern is cheap insurance).
      const { data: claimed } = await admin
        .from("video_compression_jobs")
        .update({
          status: "processing",
          attempts: (job.attempts ?? 0) + 1,
          started_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed?.length) continue;

      try {
        await processJob(admin, job);
      } catch (e: any) {
        console.error(`[video-compress] job ${job.id} (${job.storage_path}) failed:`, e?.message || e);
        const exhausted = (job.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
        await admin
          .from("video_compression_jobs")
          .update({
            status: exhausted ? "failed" : "queued",
            error: String(e?.message || e).slice(0, 500),
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        if (exhausted) {
          await notifyUploaderOfFailure(admin, job, String(e?.message || e));
        }
      }
      processed++;
    }
  } finally {
    workerBusy = false;
  }
  return { ran: true, processed };
}

/** Requeue (or fail) jobs stuck in 'processing' from a crashed/restarted VM. */
async function requeueStalledJobs(admin): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALL_REQUEUE_MS).toISOString();
    const { data: stalled } = await admin
      .from("video_compression_jobs")
      .select("id, attempts, storage_path, uploaded_by, module_id, block_id")
      .eq("status", "processing")
      .lt("started_at", cutoff);
    for (const job of stalled ?? []) {
      const exhausted = (job.attempts ?? 0) >= MAX_ATTEMPTS;
      console.warn(
        `[video-compress] ${exhausted ? "failing" : "requeuing"} stalled job ${job.id} (${job.storage_path})`
      );
      await admin
        .from("video_compression_jobs")
        .update({
          status: exhausted ? "failed" : "queued",
          error: exhausted ? "stalled in processing (VM restart?) after max attempts" : null,
        })
        .eq("id", job.id);
      if (exhausted) {
        await notifyUploaderOfFailure(admin, job, "the optimization job stalled repeatedly");
      }
    }
  } catch (e: any) {
    console.error("[video-compress] stall sweep failed:", e?.message || e);
  }
}

/**
 * In-app notification (+ best-effort Teams DM) to the uploader when a
 * compression job exhausts its attempts. Never throws — failure bookkeeping
 * must not be interrupted by notification plumbing. Requires the
 * 'video_compression_failed' notif_type enum value (migration 030); if the
 * migration hasn't been applied the insert fails and is logged by the
 * dispatcher without crashing the worker.
 */
async function notifyUploaderOfFailure(admin, job, reason: string): Promise<void> {
  try {
    if (!job?.uploaded_by) {
      console.warn(
        `[video-compress] job ${job?.id} failed but has no uploaded_by; skipping uploader notification`
      );
      return;
    }
    const { notifyUser } = await import("@/lib/notifications/dispatcher");
    const fileName = String(job.storage_path || "").split("/").pop() || job.storage_path;
    await notifyUser(
      job.uploaded_by,
      "video_compression_failed",
      {
        title: "⚠️ Your video couldn't be optimized",
        body:
          `We couldn't optimize the video you uploaded (${fileName}). ` +
          `The original file is still in place and playable, but it wasn't compressed. ` +
          `You may want to re-upload a smaller or re-encoded version.`,
        storage_path: job.storage_path,
        module_id: job.module_id ?? null,
        block_id: job.block_id ?? null,
        reason: String(reason).slice(0, 300),
        event_id: `video_compression_failed:${job.id}`,
      }
    );
    console.log(`[video-compress] notified uploader ${job.uploaded_by} of failed job ${job.id}`);
  } catch (e: any) {
    console.error(
      `[video-compress] uploader notification failed for job ${job?.id}:`,
      e?.message || e
    );
  }
}

function cleanupFiles(...paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Defense in depth: only ever touch objects that look like module video
 * uploads, and when the job carries a module_id the path must belong to that
 * module. Mirrors the binding enforced in /api/upload-complete.
 */
export function isAuthorizedJobPath(storagePath: string, moduleId?: string | null): boolean {
  if (typeof storagePath !== "string") return false;
  const pattern = moduleId
    ? new RegExp(`^module-videos/${moduleId}/[0-9a-fA-F-]{36}\\.[A-Za-z0-9]{1,8}$`)
    : /^module-videos\/[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,8}$/;
  return pattern.test(storagePath);
}

async function processJob(admin, job): Promise<void> {
  const path: string = job.storage_path;
  if (!isAuthorizedJobPath(path, job.module_id)) {
    throw new Error(`refusing job: storage_path not a module-videos upload for its module (${path})`);
  }
  const ext = (path.split(".").pop() || "").toLowerCase();
  const inFile = `/tmp/vc-in-${process.pid}-${job.id}.${ext || "bin"}`;
  const outFile = `/tmp/vc-out-${process.pid}-${job.id}.mp4`;
  cleanupFiles(inFile, outFile);

  try {
    // 1) Download via signed URL, streamed to /tmp.
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (signErr || !signed?.signedUrl) {
      throw new Error("sign download url: " + (signErr?.message || "no url"));
    }
    const res = await fetch(signed.signedUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      try { await res.arrayBuffer(); } catch { /* drain */ }
      throw new Error("download http " + res.status);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(inFile));
    const originalSize = statSync(inFile).size;
    console.log(`[video-compress] ${path}: encoding ${(originalSize / 1e6).toFixed(0)} MB...`);

    // 2) Re-encode: 1080p max, H.264 CRF23, AAC, +faststart (proven settings
    // from scripts/compress-large-videos.mjs). Run under `nice` so a long
    // encode can't starve request handling on the 1 vCPU VM.
    await execFileAsync(
      "nice",
      [
        "-n", "15",
        "ffmpeg",
        "-y", "-i", inFile,
        "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        outFile,
      ],
      { timeout: ENCODE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
    );

    const newSize = statSync(outFile).size;
    if (newSize <= 0) throw new Error("empty ffmpeg output");

    if (newSize >= originalSize) {
      console.log(`[video-compress] ${path}: output not smaller (${(newSize / 1e6).toFixed(0)} MB), keeping original`);
      await admin
        .from("video_compression_jobs")
        .update({
          status: "skipped",
          original_bytes: originalSize,
          output_bytes: newSize,
          error: "output not smaller than original",
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return;
    }

    // 3) Upload. Same path for mp4/m4v/mov (mp4 bytes play fine under those
    // extensions), but NEVER leave mp4 bytes under a .webm path — the file
    // proxy picks Content-Type by extension and iOS rejects mislabeled webm.
    // For webm: upload a sibling .mp4, repoint the block, remove the old file.
    const needsPathChange = ext === "webm";
    const targetPath = needsPathChange ? path.replace(/\.webm$/i, ".mp4") : path;

    await uploadStream(admin, targetPath, outFile, newSize);

    if (needsPathChange) {
      if (job.block_id) {
        const { data: block, error: blockErr } = await admin
          .from("module_content_blocks")
          .select("data")
          .eq("id", job.block_id)
          .maybeSingle();
        if (blockErr) throw new Error("block fetch after upload: " + blockErr.message);
        // Only repoint if the block still references the original upload.
        const currentUrl = block?.data?.url;
        if (currentUrl === `/app/files/${path}`) {
          const { error: updErr } = await admin
            .from("module_content_blocks")
            .update({ data: { ...(block?.data || {}), url: `/app/files/${targetPath}` } })
            .eq("id", job.block_id);
          if (updErr) throw new Error("block repoint failed: " + updErr.message);
          await admin.storage.from(BUCKET).remove([path]).catch?.(() => {});
        } else {
          console.warn(
            `[video-compress] ${path}: block no longer references this file; leaving original in place`
          );
        }
      } else {
        console.warn(
          `[video-compress] ${path}: webm without block reference; new .mp4 uploaded but original left in place`
        );
      }
    }

    await admin
      .from("video_compression_jobs")
      .update({
        status: "done",
        original_bytes: originalSize,
        output_bytes: newSize,
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    console.log(
      `[video-compress] ${path}: DONE ${(originalSize / 1e6).toFixed(0)} -> ${(newSize / 1e6).toFixed(0)} MB` +
        (needsPathChange ? ` (moved to ${targetPath})` : "")
    );
  } finally {
    cleanupFiles(inFile, outFile);
  }
}

/** Streamed signed-URL upload with retries (supabase-js .upload() with large
 * Buffers fails with a bare "fetch failed"). */
async function uploadStream(admin, path: string, file: string, size: number): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data: su, error: suErr } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(path, { upsert: true });
      if (suErr) throw new Error("signedUploadUrl: " + suErr.message);
      const res = await fetch(su.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
          "content-length": String(size),
          "x-upsert": "true",
          authorization: `Bearer ${serviceKey}`,
        },
        body: Readable.toWeb(createReadStream(file)),
        duplex: "half",
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const text = await res.text(); // always consume the body
      if (!res.ok) throw new Error(`upload http ${res.status}: ${text.slice(0, 200)}`);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`[video-compress] upload attempt ${attempt} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  throw new Error("upload: " + (lastErr?.message || lastErr));
}
