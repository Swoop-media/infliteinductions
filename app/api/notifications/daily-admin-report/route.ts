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

    // Get all admin users
    const { data: adminRoles, error: adminError } = await supabase
      .from("user_roles")
      .select(`
        user_id,
        role_id
      `);
    
    // Get role IDs for Admin role
    const { data: roles } = await supabase
      .from("roles")
      .select("id, name")
      .eq("name", "Admin");
    
    const adminRoleId = roles?.[0]?.id;
    const adminUserIds = adminRoles?.filter(ur => ur.role_id === adminRoleId).map(ur => ur.user_id) || [];
    
    // Get profiles for admin users
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", adminUserIds);

    if (adminError) {
      console.error("Error fetching admin users:", adminError);
      return NextResponse.json({ 
        error: "Failed to fetch admin users",
        details: adminError.message 
      }, { status: 500 });
    }

    // Fetch all completed authorization assignments
    const { data: authAssignments, error: authError } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        authorisation_id,
        user_id,
        completed_at
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null);

    // Get authorisations with valid_for_days
    let authDetails = [];
    if (authAssignments && authAssignments.length > 0) {
      const authIds = [...new Set(authAssignments.map(a => a.authorisation_id))];
      
      const { data: auths } = await supabase
        .from("authorisations")
        .select("id, title, valid_for_days")
        .in("id", authIds);
      
      const authMap = new Map(auths?.map(a => [a.id, a]) || []);
      
      // Calculate expiry dates and filter only those with valid_for_days
      const assignmentsWithExpiry = authAssignments
        .map(assignment => {
          const auth = authMap.get(assignment.authorisation_id);
          if (!auth?.valid_for_days) return null;
          
          const completedDate = new Date(assignment.completed_at);
          const expiryDate = new Date(completedDate);
          expiryDate.setDate(expiryDate.getDate() + auth.valid_for_days);
          
          return {
            ...assignment,
            expires_at: expiryDate.toISOString(),
            authorisations: auth
          };
        })
        .filter(Boolean);
      
      // Sort by expiry date and take first 25
      assignmentsWithExpiry.sort((a, b) => 
        new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
      );
      
      const next25 = assignmentsWithExpiry.slice(0, 25);
      
      // Get profiles for the next 25
      const userIds = [...new Set(next25.map(a => a.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      authDetails = next25.map(exp => ({
        ...exp,
        profiles: profileMap.get(exp.user_id)
      }));
    }

    if (authError) {
      console.error("Error fetching authorization expiries:", authError);
    }

    // Fetch upcoming document expiries (next 25 regardless of proximity)
    const { data: docExpiries, error: docError } = await supabase
      .from("learner_documents")
      .select(`
        id,
        title,
        expires_on,
        user_id
      `)
      .not("expires_on", "is", null)
      .order("expires_on", { ascending: true })
      .limit(25);
    
    // Get profiles for document expiries
    let docDetails = [];
    if (docExpiries && docExpiries.length > 0) {
      const userIds = [...new Set(docExpiries.map(d => d.user_id))];
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      docDetails = docExpiries.map(doc => ({
        ...doc,
        profiles: profileMap.get(doc.user_id)
      }));
    }

    if (docError) {
      console.error("Error fetching document expiries:", docError);
    }

    // Prepare authorization summary as an array
    let authSummaryLines = [];
    if (authDetails.length > 0) {
      const itemCount = Math.min(authDetails.length, 25);
      authSummaryLines.push(`Top ${itemCount} expiring authorizations:`);
      authDetails.slice(0, 25).forEach(auth => {
        const expiryDate = new Date(auth.expires_at);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "EXPIRED" : `${daysUntil} days`;
        authSummaryLines.push(`• ${auth.authorisations?.title || 'Authorization'} - ${auth.profiles?.full_name || 'User'} (${status})`);
      });
    }

    // Prepare document summary as an array
    let docSummaryLines = [];
    if (docDetails.length > 0) {
      const itemCount = Math.min(docDetails.length, 25);
      docSummaryLines.push(`Top ${itemCount} expiring documents:`);
      docDetails.slice(0, 25).forEach(doc => {
        const expiryDate = new Date(doc.expires_on);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "EXPIRED" : `${daysUntil} days`;
        docSummaryLines.push(`• ${doc.title || 'Document'} - ${doc.profiles?.full_name || 'User'} (${status})`);
      });
    }

    let notificationsSent = 0;

    // Send daily reports to each admin
    for (const admin of adminProfiles || []) {
      const adminId = admin.id;
      const adminName = admin.full_name || admin.email;

      // Send authorization expiry report
      if (authDetails.length > 0) {
        await notifyUser(
          adminId,
          "daily_auth_expiry_report",
          {
            count: authDetails.length,
            summary: authSummaryLines,
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
      if (docDetails.length > 0) {
        await notifyUser(
          adminId,
          "daily_doc_expiry_report",
          {
            count: docDetails.length,
            summary: docSummaryLines,
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
      adminUsers: adminProfiles?.length || 0,
      authorizationExpiries: authDetails.length,
      documentExpiries: docDetails.length,
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