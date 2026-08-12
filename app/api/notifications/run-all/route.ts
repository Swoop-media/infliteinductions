// @ts-nocheck
// Master endpoint to run all notification checks
// Can be called by a single cron job to trigger all notification types

import { NextRequest, NextResponse } from "next/server";
import { kickVideoCompressionWorker } from "@/lib/video-compression";

// Single-flight guard: prevents overlapping cron invocations from piling up
// duplicate sweeps and external sends on the single-vCPU VM. In-memory is
// sufficient because a Reserved VM runs exactly one Node process.
let runAllInFlight = false;

export async function GET(request: NextRequest) {
  // GET handler for easy testing via browser
  return NextResponse.json({ 
    message: "This endpoint accepts POST requests to run all notification jobs",
    usage: "Send a POST request with Authorization header if CRON_SECRET is set",
    endpoints: [
      "/api/notifications/document-expiry",
      "/api/notifications/authorization-expiry", 
      "/api/notifications/retake-reminders",
      "/api/notifications/daily-admin-report",
      "/api/authorization-auto-fix",
      "/api/cron/document-sweep (Sundays only, or force with { forceDocumentSweep: true })"
    ]
  });
}

export async function POST(request: NextRequest) {
  let acquiredLock = false;
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (runAllInFlight) {
      console.warn("run-all skipped: previous invocation still in flight");
      return NextResponse.json(
        { success: false, skipped: true, reason: "previous run still in flight" },
        { status: 409 }
      );
    }
    runAllInFlight = true;
    acquiredLock = true;

    // Use relative URLs for internal API calls in Replit environment
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    const results: Record<string, any> = {};
    const errors: string[] = [];

    // Run all notification jobs in parallel for speed
    const jobs = [
      { name: 'documentExpiry', url: `${baseUrl}/api/notifications/document-expiry` },
      { name: 'authorizationExpiry', url: `${baseUrl}/api/notifications/authorization-expiry` },
      { name: 'retakeReminders', url: `${baseUrl}/api/notifications/retake-reminders` },
      { name: 'dailyAdminReport', url: `${baseUrl}/api/notifications/daily-admin-report` },
      { name: 'authorizationAutoFix', url: `${baseUrl}/api/authorization-auto-fix` }
    ];

    // Weekly stranded-file document sweep: run-all is called daily by the
    // external cron, so gate the sweep to Sundays (UTC) to make it weekly.
    // Pass { forceDocumentSweep: true } in the body to run it on any day.
    const body = await request.json().catch(() => ({}));
    const isSunday = new Date().getUTCDay() === 0;
    if (isSunday || body?.forceDocumentSweep === true) {
      jobs.push({ name: 'documentSweep', url: `${baseUrl}/api/cron/document-sweep` });
    }

    // Run jobs SEQUENTIALLY with a per-job timeout. Parallel fan-out of 5-6
    // table-sweeping jobs (each sending Teams DMs/emails) spikes sockets and
    // memory on the 1 vCPU VM; sequential keeps peak load flat, and the cron
    // interval is far longer than the total runtime.
    const jobResults: Array<{ name: string; result: any; error: string | null }> = [];
    for (const job of jobs) {
      try {
        const response = await fetch(job.url, {
          method: 'POST',
          headers: {
            'authorization': authHeader || '',
            'Content-Type': 'application/json'
          },
          // Hard cap per job so one hung job can't wedge the whole run.
          signal: AbortSignal.timeout(120000)
        });
        jobResults.push({ name: job.name, result: await response.json(), error: null });
      } catch (error: any) {
        jobResults.push({ name: job.name, result: null, error: error.message });
      }
    }

    // Rescue stranded video compression jobs (VM restarts leave them in
    // 'queued'). Called in-process — no self-fetch, no credential forwarding,
    // no SSRF surface. The worker's own single-flight guard makes this a no-op
    // when an encode is already running.
    kickVideoCompressionWorker();

    for (const job of jobResults) {
      if (job.error) {
        errors.push(`${job.name}: ${job.error}`);
      } else {
        results[job.name] = job.result;
      }
    }

    const summary = {
      success: errors.length === 0,
      timestamp: new Date().toISOString(),
      results,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log("All notification jobs completed:", summary);

    return NextResponse.json(summary);
    
  } catch (error: any) {
    console.error("Master scheduler error:", error);
    return NextResponse.json({ 
      error: "Failed to run notification jobs",
      details: error.message 
    }, { status: 500 });
  } finally {
    if (acquiredLock) runAllInFlight = false;
  }
}