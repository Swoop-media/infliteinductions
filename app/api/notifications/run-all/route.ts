// @ts-nocheck
// Master endpoint to run all notification checks
// Can be called by a single cron job to trigger all notification types

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:5000';

    const results = {};
    const errors = [];

    // Run document expiry notifications
    try {
      const docResponse = await fetch(`${baseUrl}/api/notifications/document-expiry`, {
        method: 'POST',
        headers: {
          'authorization': authHeader || '',
          'Content-Type': 'application/json'
        }
      });
      results.documentExpiry = await docResponse.json();
    } catch (error: any) {
      errors.push(`Document expiry: ${error.message}`);
    }

    // Run authorization expiry notifications
    try {
      const authResponse = await fetch(`${baseUrl}/api/notifications/authorization-expiry`, {
        method: 'POST',
        headers: {
          'authorization': authHeader || '',
          'Content-Type': 'application/json'
        }
      });
      results.authorizationExpiry = await authResponse.json();
    } catch (error: any) {
      errors.push(`Authorization expiry: ${error.message}`);
    }

    // Run retake reminder notifications
    try {
      const retakeResponse = await fetch(`${baseUrl}/api/notifications/retake-reminders`, {
        method: 'POST',
        headers: {
          'authorization': authHeader || '',
          'Content-Type': 'application/json'
        }
      });
      results.retakeReminders = await retakeResponse.json();
    } catch (error: any) {
      errors.push(`Retake reminders: ${error.message}`);
    }

    // Run daily admin reports
    try {
      const adminResponse = await fetch(`${baseUrl}/api/notifications/daily-admin-report`, {
        method: 'POST',
        headers: {
          'authorization': authHeader || '',
          'Content-Type': 'application/json'
        }
      });
      results.dailyAdminReport = await adminResponse.json();
    } catch (error: any) {
      errors.push(`Daily admin report: ${error.message}`);
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