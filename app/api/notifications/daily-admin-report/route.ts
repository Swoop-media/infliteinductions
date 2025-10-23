// @ts-nocheck
// API endpoint to send daily expiry reports to admin users
// Should be called daily by a cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!url || !key) {
    throw new Error("Supabase admin environment variables not set");
  }
  
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized (could be from a cron job with a secret)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Get all admin users
    const { data: adminUsers, error: adminError } = await supabase
      .from("user_roles")
      .select(`
        user_id,
        profiles!inner(
          id,
          full_name,
          email
        ),
        roles!inner(
          name
        )
      `)
      .eq("roles.name", "Admin");

    if (adminError) {
      console.error("Error fetching admin users:", adminError);
      return NextResponse.json({ 
        error: "Failed to fetch admin users",
        details: adminError.message 
      }, { status: 500 });
    }

    // Fetch upcoming authorization expiries (next 50)
    const { data: authExpiries, error: authError } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        expires_at,
        authorisations!inner(
          title
        ),
        profiles!inner(
          full_name,
          email
        )
      `)
      .eq("assignment_status", "approved")
      .not("expires_at", "is", null)
      .lte("expires_at", thirtyDaysFromNow.toISOString())
      .order("expires_at", { ascending: true })
      .limit(50);

    if (authError) {
      console.error("Error fetching authorization expiries:", authError);
    }

    // Fetch upcoming document expiries (next 50)
    const { data: docExpiries, error: docError } = await supabase
      .from("documents")
      .select(`
        id,
        name,
        expires_on,
        profiles!inner(
          full_name,
          email
        )
      `)
      .not("expires_on", "is", null)
      .lte("expires_on", thirtyDaysFromNow.toISOString())
      .order("expires_on", { ascending: true })
      .limit(50);

    if (docError) {
      console.error("Error fetching document expiries:", docError);
    }

    // Prepare authorization summary
    let authSummary = "";
    if (authExpiries && authExpiries.length > 0) {
      authSummary = "Top 5 expiring authorizations:\n";
      authExpiries.slice(0, 5).forEach(auth => {
        const expiryDate = new Date(auth.expires_at);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "EXPIRED" : `${daysUntil} days`;
        authSummary += `  • ${auth.authorisations.title} - ${auth.profiles.full_name} (${status})\n`;
      });
    }

    // Prepare document summary
    let docSummary = "";
    if (docExpiries && docExpiries.length > 0) {
      docSummary = "Top 5 expiring documents:\n";
      docExpiries.slice(0, 5).forEach(doc => {
        const expiryDate = new Date(doc.expires_on);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "EXPIRED" : `${daysUntil} days`;
        docSummary += `  • ${doc.name} - ${doc.profiles.full_name} (${status})\n`;
      });
    }

    let notificationsSent = 0;

    // Send daily reports to each admin
    for (const admin of adminUsers || []) {
      const adminId = admin.user_id;
      const adminName = admin.profiles?.full_name || admin.profiles?.email;

      // Send authorization expiry report
      if (authExpiries && authExpiries.length > 0) {
        await notifyUser(
          adminId,
          "daily_auth_expiry_report",
          {
            count: authExpiries.length,
            summary: authSummary,
            adminName: adminName,
            url: `/app/admin?tab=due-dates-authorisations`
          },
          { 
            eventId: `daily_auth_report_${adminId}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsSent++;
      }

      // Send document expiry report
      if (docExpiries && docExpiries.length > 0) {
        await notifyUser(
          adminId,
          "daily_doc_expiry_report",
          {
            count: docExpiries.length,
            summary: docSummary,
            adminName: adminName,
            url: `/app/admin?tab=due-dates-documents`
          },
          { 
            eventId: `daily_doc_report_${adminId}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsSent++;
      }
    }

    const summary = {
      adminUsers: adminUsers?.length || 0,
      authorizationExpiries: authExpiries?.length || 0,
      documentExpiries: docExpiries?.length || 0,
      notificationsSent,
      timestamp: new Date().toISOString()
    };

    console.log("Daily admin reports sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Daily admin report error:", error);
    return NextResponse.json({ 
      error: "Failed to send daily admin reports",
      details: error.message 
    }, { status: 500 });
  }
}