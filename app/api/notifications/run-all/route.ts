// @ts-nocheck
// Master endpoint to run all notification checks
// Can be called by a single cron job to trigger all notification types

import { NextRequest, NextResponse } from "next/server";

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
      "/api/authorization-auto-fix"
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const jobPromises = jobs.map(async (job) => {
      try {
        const response = await fetch(job.url, {
          method: 'POST',
          headers: {
            'authorization': authHeader || '',
            'Content-Type': 'application/json'
          }
        });
        return { name: job.name, result: await response.json(), error: null };
      } catch (error: any) {
        return { name: job.name, result: null, error: error.message };
      }
    });

    const jobResults = await Promise.all(jobPromises);

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
  }
}