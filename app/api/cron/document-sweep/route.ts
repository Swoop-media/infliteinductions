// @ts-nocheck
// app/api/cron/document-sweep/route.ts
//
// Scheduled (cron-style) sweep for stranded files in the learner-documents
// bucket. Meant to be called weekly by an external cron/scheduler:
//
//   POST /api/cron/document-sweep
//   Authorization: Bearer <CRON_SECRET or TRAINING_SYNC_SECRET>
//
// Secured like the TRAINING_SYNC_SECRET pattern (fail closed): if neither
// secret is configured the endpoint refuses to run; a missing or mismatched
// header is a 401. CRON_SECRET is preferred (shared with the other
// /api/notifications cron endpoints); TRAINING_SYNC_SECRET is accepted as a
// fallback so the endpoint is usable with the secrets already provisioned.
//
// Reuses the exact same sweep logic and safety guarantees as the manual
// admin page (24h+ safety window, learner_documents reference check,
// fail-closed on any check error) via lib/document-sweep.ts.
//
// REPORT-ONLY: this scheduled endpoint NEVER deletes files. It always runs
// the sweep as a dry run, and when stranded files are found (or errors
// occur) it notifies all Admin and Senior Management users via notifyUser
// (in-app notification + best-effort Teams DM) so a human can review and
// delete them in the admin tool. Quiet runs (nothing found, no errors) are
// logged but not notified, so admins aren't spammed weekly with "0 found".

import { NextRequest, NextResponse } from "next/server";
import { runDocumentSweep } from "@/lib/document-sweep";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/dispatcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    message:
      "This endpoint accepts POST requests to run the stranded-file document sweep",
    usage:
      "POST with 'Authorization: Bearer <secret>' where <secret> is CRON_SECRET (or TRAINING_SYNC_SECRET). Optional JSON body: { safetyWindowHours?: number }. This endpoint is report-only and never deletes files.",
  });
}

async function getAdminUserIds(admin): Promise<string[]> {
  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("id, name")
    .in("name", ["Admin", "Senior Management"]);
  if (rolesError || !roles?.length) {
    console.error("[document-sweep-cron] failed to fetch roles:", rolesError);
    return [];
  }
  const { data: userRoles, error: urError } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role_id", roles.map((r) => r.id));
  if (urError) {
    console.error("[document-sweep-cron] failed to fetch user roles:", urError);
    return [];
  }
  return [...new Set((userRoles ?? []).map((ur) => ur.user_id))];
}

export async function POST(req: NextRequest) {
  try {
    // Fail closed: refuse to run at all if no secret is configured.
    const secret = process.env.CRON_SECRET || process.env.TRAINING_SYNC_SECRET;
    if (!secret) {
      console.error(
        "[document-sweep-cron] neither CRON_SECRET nor TRAINING_SYNC_SECRET is set"
      );
      return NextResponse.json(
        { error: "Cron secret not configured" },
        { status: 500 }
      );
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // ALWAYS a dry run — the scheduled sweep only finds and reports,
    // it never deletes. Deletion is a manual, reviewed admin action in
    // /app/admin/tools/document-sweep.
    const result = await runDocumentSweep({
      dryRun: true,
      safetyWindowHours: body?.safetyWindowHours,
    });

    const found = result.wouldDelete?.length ?? 0;
    console.log(
      `[document-sweep-cron] report-only run complete: scanned=${result.scanned}, ` +
        `candidates=${result.candidatesOlderThanWindow}, found=${found}, ` +
        `refCheckErrors=${result.refCheckErrors} (nothing deleted)`
    );

    // Report findings to admins (skip quiet no-op runs).
    const hadErrors = result.refCheckErrors > 0;
    let notifiedAdmins = 0;
    if (found > 0 || hadErrors) {
      try {
        const admin = supabaseAdmin();
        const adminIds = await getAdminUserIds(admin);

        const summaryLines = [
          `Scanned ${result.scanned} file${result.scanned !== 1 ? "s" : ""}, found ${found} possible stranded file${found !== 1 ? "s" : ""} awaiting review.`,
          `No files were deleted automatically — please review them in Admin → Tools → Stranded upload cleanup and decide what to remove.`,
        ];
        if (found > 0) {
          summaryLines.push(
            ...(result.wouldDelete ?? []).slice(0, 25).map((p) => `• ${p}`)
          );
          if (found > 25) {
            summaryLines.push(`…and ${found - 25} more`);
          }
        }
        if (result.refCheckErrors > 0) {
          summaryLines.push(
            `⚠️ ${result.refCheckErrors} reference check batch${result.refCheckErrors !== 1 ? "es" : ""} failed (those files were skipped and not listed).`
          );
        }

        const runStamp = new Date().toISOString();
        for (const adminId of adminIds) {
          try {
            await notifyUser(
              adminId,
              "document_sweep_report",
              {
                title: "Stranded Documents Found — Review Needed",
                count: found,
                errors: result.refCheckErrors,
                summary: summaryLines,
                url: "/app/admin/tools/document-sweep",
              },
              { eventId: `document_sweep_${adminId}_${runStamp}` }
            );
            notifiedAdmins++;
          } catch (e) {
            console.error(
              `[document-sweep-cron] failed to notify admin ${adminId}:`,
              e
            );
          }
        }
      } catch (e) {
        // Reporting is best-effort; the sweep itself already succeeded.
        console.error("[document-sweep-cron] admin reporting step failed:", e);
      }
    }

    return NextResponse.json({ ...result, notifiedAdmins });
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid safety window") {
      return NextResponse.json({ error: "Invalid safety window" }, { status: 400 });
    }
    console.error("[document-sweep-cron] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
