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
// After a live (non-dry-run) sweep, a summary is reported to all Admin and
// Senior Management users via notifyUser (in-app notification + best-effort
// Teams DM) whenever anything was deleted or any errors occurred. Quiet runs
// (nothing to delete, no errors) are logged but not notified, so admins
// aren't spammed weekly with "0 deleted".

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
      "POST with 'Authorization: Bearer <secret>' where <secret> is CRON_SECRET (or TRAINING_SYNC_SECRET). Optional JSON body: { dryRun?: boolean, safetyWindowHours?: number }",
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
    const dryRun = body?.dryRun === true;

    const result = await runDocumentSweep({
      dryRun,
      safetyWindowHours: body?.safetyWindowHours,
    });

    console.log(
      `[document-sweep-cron] run complete: scanned=${result.scanned}, ` +
        `candidates=${result.candidatesOlderThanWindow}, deleted=${result.deletedCount}, ` +
        `refCheckErrors=${result.refCheckErrors}, deleteErrors=${result.deleteErrors.length}, dryRun=${dryRun}`
    );

    // Report the result to admins (skip dry runs and quiet no-op runs).
    const hadErrors = result.refCheckErrors > 0 || result.deleteErrors.length > 0;
    let notifiedAdmins = 0;
    if (!dryRun && (result.deletedCount > 0 || hadErrors)) {
      try {
        const admin = supabaseAdmin();
        const adminIds = await getAdminUserIds(admin);

        const summaryLines = [
          `Scanned ${result.scanned} file${result.scanned !== 1 ? "s" : ""}, deleted ${result.deletedCount} stranded file${result.deletedCount !== 1 ? "s" : ""}.`,
        ];
        if (result.deletedCount > 0) {
          summaryLines.push(
            ...result.deleted.slice(0, 25).map((p) => `• ${p}`)
          );
          if (result.deleted.length > 25) {
            summaryLines.push(`…and ${result.deleted.length - 25} more`);
          }
        }
        if (result.refCheckErrors > 0) {
          summaryLines.push(
            `⚠️ ${result.refCheckErrors} reference check batch${result.refCheckErrors !== 1 ? "es" : ""} failed (those files were skipped, not deleted).`
          );
        }
        if (result.deleteErrors.length > 0) {
          summaryLines.push(
            `⚠️ ${result.deleteErrors.length} delete batch${result.deleteErrors.length !== 1 ? "es" : ""} failed: ${result.deleteErrors.join("; ")}`
          );
        }

        const runStamp = new Date().toISOString();
        for (const adminId of adminIds) {
          try {
            await notifyUser(
              adminId,
              "document_sweep_report",
              {
                title: "Automatic Document Sweep Report",
                count: result.deletedCount,
                errors: result.refCheckErrors + result.deleteErrors.length,
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
