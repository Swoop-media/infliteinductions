// @ts-nocheck
// app/api/cron/video-compress/route.ts
//
// Cron pickup for the video compression queue. The normal trigger is
// /api/upload-complete kicking the worker in-process right after an
// oversized video upload; this endpoint exists so jobs stranded by a VM
// restart (or a failed kick) still get processed by the daily cron.
//
//   POST /api/cron/video-compress
//   Authorization: Bearer <CRON_SECRET or TRAINING_SYNC_SECRET>
//
// Fail closed: refuses to run when no secret is configured. The response
// returns queue counts immediately and kicks the worker in the background —
// encoding a 300MB video can take far longer than any HTTP timeout.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { kickVideoCompressionWorker } from "@/lib/video-compression";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    message: "This endpoint accepts POST requests to process the video compression queue",
    usage:
      "POST with 'Authorization: Bearer <secret>' where <secret> is CRON_SECRET (or TRAINING_SYNC_SECRET). Returns queue counts and kicks the background worker.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || process.env.TRAINING_SYNC_SECRET;
    if (!secret) {
      console.error("[video-compress-cron] neither CRON_SECRET nor TRAINING_SYNC_SECRET is set");
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Queue snapshot for the cron log (degrades gracefully if the table
    // hasn't been migrated yet).
    let counts: Record<string, number> | null = null;
    try {
      const admin = createSupabaseService();
      const { data, error } = await admin
        .from("video_compression_jobs")
        .select("status");
      if (!error && data) {
        counts = {};
        for (const row of data) counts[row.status] = (counts[row.status] || 0) + 1;
      }
    } catch (e: any) {
      console.error("[video-compress-cron] queue snapshot failed:", e?.message || e);
    }

    // Kick the worker in the background; single-flight lock inside makes
    // this a no-op when a run is already in progress.
    kickVideoCompressionWorker();

    return NextResponse.json({
      success: true,
      kicked: true,
      queue: counts,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[video-compress-cron] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
