// @ts-nocheck
// GET /api/video-compression-status?blockId=<uuid>
//
// Creator-facing status probe for the background video compression queue
// (video_compression_jobs). Used by the module editor's video block to show
// an "Optimizing video…" indicator while a queued/processing job exists for
// the block, to clear it once the job is done/skipped, and to surface a
// warning when the latest job failed (original oversized file stays live).
//
// video_compression_jobs is service-role-only under RLS, so the query runs
// through the service client — AFTER the same auth + creator-role check the
// upload routes use (creator-area role gating rule).

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { hasRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasCreatorRole =
      (await hasRole("Course Creators")) ||
      (await hasRole("Senior management")) ||
      (await hasRole("Admin"));
    if (!hasCreatorRole) {
      return NextResponse.json({ error: "Insufficient permissions. Creator role required." }, { status: 403 });
    }

    const blockId = request.nextUrl.searchParams.get("blockId");
    if (!blockId) {
      return NextResponse.json({ error: "Missing blockId" }, { status: 400 });
    }

    const admin = createSupabaseService();
    const { data: jobs, error } = await admin
      .from("video_compression_jobs")
      .select("status, storage_path, created_at")
      .eq("block_id", blockId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      // PGRST205 = table missing (migration not applied) — treat as no job.
      console.error("[video-compress] status lookup failed:", error.message);
      return NextResponse.json({ status: "none" });
    }

    const job = jobs?.[0];
    if (!job) return NextResponse.json({ status: "none" });

    // A terminal job only describes the file it processed. If the block's
    // current video no longer points at that file (e.g. the creator replaced
    // a failed oversized upload with a smaller re-export that never queued a
    // new job), the old job's status is stale — report "none" so the editor
    // doesn't show a failure/done banner for a different file. Active
    // (queued/processing) jobs are reported as-is. A done .webm job repoints
    // the block to the sibling .mp4 path, so match that too.
    if (job.status === "failed" || job.status === "done" || job.status === "skipped") {
      const { data: block, error: blockErr } = await admin
        .from("module_content_blocks")
        .select("data")
        .eq("id", blockId)
        .maybeSingle();
      if (!blockErr) {
        const currentUrl = block?.data?.url ?? "";
        const jobUrl = `/app/files/${job.storage_path}`;
        const jobUrlMp4 = jobUrl.replace(/\.webm$/i, ".mp4");
        // Format-fix uploads hold the block URL back until conversion
        // finishes, so a failed format-fix job leaves the URL empty (marker
        // cleared by the worker). An empty URL means no newer file replaced
        // this one — the job's status is still about the block's video.
        const pendingMatches = block?.data?.pending_format_fix === job.storage_path;
        if (currentUrl !== jobUrl && currentUrl !== jobUrlMp4 && !pendingMatches && currentUrl !== "") {
          return NextResponse.json({ status: "none" });
        }
      }
    }

    return NextResponse.json({ status: job.status });
  } catch (e) {
    console.error("[video-compress] status route error:", e);
    return NextResponse.json({ error: "Failed to check compression status" }, { status: 500 });
  }
}
