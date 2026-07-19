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

    // Build set of archived user IDs so their items are excluded from daily reports
    const { data: archivedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .not("archived_at", "is", null);
    const archivedUserIdSet = new Set((archivedProfiles || []).map(p => p.id));

    // Get Admin and Senior Management role IDs
    const { data: roles, error: rolesError } = await supabase
      .from("roles")
      .select("id, name")
      .in("name", ["Admin", "Senior Management"]);
    
    if (rolesError || !roles || roles.length === 0) {
      console.error("Error fetching roles:", rolesError);
      return NextResponse.json({ 
        error: "Failed to fetch roles",
        details: rolesError?.message 
      }, { status: 500 });
    }

    const roleIds = roles.map(r => r.id);

    // Get all users with Admin or Senior Management role
    const { data: userRoles, error: userRolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role_id", roleIds);

    if (userRolesError) {
      console.error("Error fetching user roles:", userRolesError);
      return NextResponse.json({ 
        error: "Failed to fetch user roles",
        details: userRolesError.message 
      }, { status: 500 });
    }
    
    // Deduplicate user IDs (in case someone has both roles)
    const uniqueUserIds = [...new Set(userRoles?.map(ur => ur.user_id) || [])];
    
    // Get profiles for recipient users
    const { data: recipientProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", uniqueUserIds);

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
      // Also filter to only include items overdue or expiring within 30 days
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      thirtyDaysFromNow.setHours(23, 59, 59, 999); // End of the 30th day
      
      const assignmentsWithExpiry = authAssignments
        .filter(assignment => !archivedUserIdSet.has(assignment.user_id))
        .map(assignment => {
          const auth = authMap.get(assignment.authorisation_id);
          if (!auth?.valid_for_days) return null;
          
          const completedDate = new Date(assignment.completed_at);
          const expiryDate = new Date(completedDate);
          expiryDate.setDate(expiryDate.getDate() + auth.valid_for_days);
          
          // Only include if overdue (before today) or expiring within 30 days
          if (expiryDate > thirtyDaysFromNow) return null;
          
          return {
            ...assignment,
            expires_at: expiryDate.toISOString(),
            authorisations: auth
          };
        })
        .filter(Boolean);
      
      // Sort by expiry date and take first 50
      assignmentsWithExpiry.sort((a, b) => 
        new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
      );
      
      const next50 = assignmentsWithExpiry.slice(0, 50);
      
      // Get profiles for the next 50
      const userIds = [...new Set(next50.map(a => a.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      authDetails = next50.map(exp => ({
        ...exp,
        profiles: profileMap.get(exp.user_id)
      }));
    }

    if (authError) {
      console.error("Error fetching authorization expiries:", authError);
    }

    // Fetch upcoming document expiries - filter to overdue or within 30 days, limit 50
    // Manually construct date string to avoid timezone issues with toISOString()
    const thirtyDaysFromNowDate = new Date(today);
    thirtyDaysFromNowDate.setDate(thirtyDaysFromNowDate.getDate() + 30);
    const year = thirtyDaysFromNowDate.getFullYear();
    const month = String(thirtyDaysFromNowDate.getMonth() + 1).padStart(2, '0');
    const day = String(thirtyDaysFromNowDate.getDate()).padStart(2, '0');
    const thirtyDaysStr = `${year}-${month}-${day}`;
    
    let docExpiriesQuery = supabase
      .from("learner_documents")
      .select(`
        id,
        title,
        expires_on,
        user_id
      `)
      .not("expires_on", "is", null)
      .or("status.is.null,status.neq.replaced")
      .lte("expires_on", thirtyDaysStr)
      .order("expires_on", { ascending: true })
      .limit(50);
    if (archivedUserIdSet.size > 0) {
      docExpiriesQuery = docExpiriesQuery.not(
        "user_id",
        "in",
        `(${[...archivedUserIdSet].join(",")})`
      );
    }
    const { data: docExpiries, error: docError } = await docExpiriesQuery;
    
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
      const itemCount = Math.min(authDetails.length, 50);
      authSummaryLines.push(`📜 Daily Authorization Expiry Report (${itemCount} items due within 30 days or overdue):`);
      authDetails.slice(0, 50).forEach(auth => {
        const expiryDate = new Date(auth.expires_at);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "⚠️ OVERDUE" : daysUntil <= 7 ? `🔴 ${daysUntil} days` : `${daysUntil} days`;
        authSummaryLines.push(`• ${auth.authorisations?.title || 'Authorization'} - ${auth.profiles?.full_name || 'User'} (${status})`);
      });
    }

    // Prepare document summary as an array
    let docSummaryLines = [];
    if (docDetails.length > 0) {
      const itemCount = Math.min(docDetails.length, 50);
      docSummaryLines.push(`📄 Daily Document Expiry Report (${itemCount} items due within 30 days or overdue):`);
      docDetails.slice(0, 50).forEach(doc => {
        const expiryDate = new Date(doc.expires_on);
        const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil <= 0 ? "⚠️ OVERDUE" : daysUntil <= 7 ? `🔴 ${daysUntil} days` : `${daysUntil} days`;
        docSummaryLines.push(`• ${doc.title || 'Document'} - ${doc.profiles?.full_name || 'User'} (${status})`);
      });
    }

    let notificationsSent = 0;

    // Send daily reports to each Admin and Senior Management user
    for (const recipient of recipientProfiles || []) {
      const recipientId = recipient.id;
      const recipientName = recipient.full_name || recipient.email;

      // Send authorization expiry report
      if (authDetails.length > 0) {
        await notifyUser(
          recipientId,
          "daily_auth_expiry_report",
          {
            count: authDetails.length,
            summary: authSummaryLines,
            adminName: recipientName,
            url: `/app/admin?tab=due-dates-authorisations`
          },
          { 
            eventId: `daily_auth_report_${recipientId}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsSent++;
      }

      // Send document expiry report
      if (docDetails.length > 0) {
        await notifyUser(
          recipientId,
          "daily_doc_expiry_report",
          {
            count: docDetails.length,
            summary: docSummaryLines,
            adminName: recipientName,
            url: `/app/admin?tab=due-dates-documents`
          },
          { 
            eventId: `daily_doc_report_${recipientId}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsSent++;
      }
    }

    const summary = {
      recipientUsers: recipientProfiles?.length || 0,
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