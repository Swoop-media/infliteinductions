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
import { runDocumentSweep } from "@/lib/document-sweep";
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
    const result = await runDocumentSweep({
      dryRun: body?.dryRun === true,
      safetyWindowHours: body?.safetyWindowHours,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid safety window") {
      return NextResponse.json({ error: "Invalid safety window" }, { status: 400 });
    }
    console.error("[document-sweep] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
