// @ts-nocheck
// GET /api/video-compression-status?blockId=<uuid>
//
// Creator-facing status probe for the background video compression queue
// (video_compression_jobs). Used by the module editor's video block to show
// an "Optimizing video…" indicator while a queued/processing job exists for
// the block, and to clear it once the job is done/skipped/failed.
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
      .select("status, created_at")
      .eq("block_id", blockId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      // PGRST205 = table missing (migration not applied) — treat as no job.
      console.error("[video-compress] status lookup failed:", error.message);
      return NextResponse.json({ status: "none" });
    }

    return NextResponse.json({ status: jobs?.[0]?.status ?? "none" });
  } catch (e) {
    console.error("[video-compress] status route error:", e);
    return NextResponse.json({ error: "Failed to check compression status" }, { status: 500 });
  }
}
