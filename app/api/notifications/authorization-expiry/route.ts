// @ts-nocheck
// API endpoint to check for authorization expiry and send notifications
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

    // Fetch all authorization assignments with expiry dates
    const { data: assignments, error } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status,
        expires_at
      `)
      .eq("assignment_status", "approved")
      .not("expires_at", "is", null)
      .order("expires_at", { ascending: true });
    
    // Get authorizations separately
    const authIds = [...new Set((assignments || []).map(a => a.authorisation_id))];
    const { data: authorisations } = await supabase
      .from("authorisations")
      .select("id, title, valid_for_days, retake_reminder_days")
      .in("id", authIds);
    
    const authMap = new Map(authorisations?.map(a => [a.id, a]) || []);
    
    // Get user profiles separately
    const userIds = [...new Set((assignments || []).map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    if (error) {
      console.error("Error fetching authorization assignments:", error);
      return NextResponse.json({ 
        error: "Failed to fetch authorization assignments",
        details: error.message 
      }, { status: 500 });
    }

    let notificationsExpired = 0;
    let notificationsRetakeReminder = 0;

    for (const assignment of assignments || []) {
      const expiryDate = new Date(assignment.expires_at);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Format expiry date for display
      const formattedExpiryDate = expiryDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const auth = authMap.get(assignment.authorisation_id);
      const profile = profileMap.get(assignment.user_id);
      const authTitle = auth?.title || "Authorization";
      const retakeReminderDays = auth?.retake_reminder_days || 30; // Default to 30 days

      // Check if authorization has expired
      if (daysUntilExpiry <= 0) {
        // Send authorization expired notification
        await notifyUser(
          assignment.user_id,
          "authorization_expired",
          {
            authorizationTitle: authTitle,
            authorizationId: assignment.authorisation_id,
            expiredDate: formattedExpiryDate,
            daysOverdue: Math.abs(daysUntilExpiry),
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `auth_expired_${assignment.id}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsExpired++;

        // Update the assignment status to expired
        await supabase
          .from("authorisation_assignments")
          .update({ assignment_status: "expired" })
          .eq("id", assignment.id);
      } 
      // Check if we should send a retake reminder
      else if (daysUntilExpiry === retakeReminderDays) {
        // Send retake reminder notification
        await notifyUser(
          assignment.user_id,
          "retake_reminder",
          {
            type: "Authorization",
            itemTitle: authTitle,
            authorizationId: assignment.authorisation_id,
            daysUntilExpiry: daysUntilExpiry,
            expiryDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `auth_retake_reminder_${assignment.id}_${retakeReminderDays}days`,
            skipTeams: false 
          }
        );
        notificationsRetakeReminder++;
      }
    }

    const summary = {
      totalAssignments: assignments?.length || 0,
      notificationsExpired,
      notificationsRetakeReminder,
      timestamp: new Date().toISOString()
    };

    console.log("Authorization expiry notifications sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Authorization expiry notification error:", error);
    return NextResponse.json({ 
      error: "Failed to process authorization expiry notifications",
      details: error.message 
    }, { status: 500 });
  }
}