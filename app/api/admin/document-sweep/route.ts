// @ts-nocheck
// app/api/admin/document-sweep/route.ts
//
// Admin-triggered sweep for stranded files in the learner-documents bucket.
// The sweep logic itself (safety window, reference check, fail-closed
// behavior) lives in lib/document-sweep.ts and is shared with the scheduled
// cron route (/api/cron/document-sweep).
//
// Admin-only: has_role check server-side; the service-role client is used
// only after the role check passes.

import { NextRequest, NextResponse } from "next/server";
import { runDocumentSweep, deleteReviewedFiles } from "@/lib/document-sweep";
import { hasRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    if (body?.dryRun === true) {
      // Scan: report-only, never deletes.
      const result = await runDocumentSweep({
        dryRun: true,
        safetyWindowHours: body?.safetyWindowHours,
      });
      return NextResponse.json(result);
    }

    // Delete: only the explicitly reviewed paths, revalidated server-side.
    // A blanket "delete whatever a fresh sweep finds" is intentionally not
    // supported — deletion must be limited to what the admin saw and approved.
    if (!Array.isArray(body?.paths) || body.paths.length === 0) {
      return NextResponse.json(
        { error: "No reviewed files provided — run a scan and review the list first" },
        { status: 400 }
      );
    }
    const result = await deleteReviewedFiles(body.paths, {
      safetyWindowHours: body?.safetyWindowHours,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid safety window") {
      return NextResponse.json({ error: "Invalid safety window" }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "No paths provided" || e.message === "Too many paths")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[document-sweep] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
