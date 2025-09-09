// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.SUPABASE_DB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    // Verify webhook secret
    const providedSecret = request.headers.get("x-webhook-secret");
    if (providedSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    console.log("Authorisation pending approval webhook received:", payload);

    // Extract the notification data from the payload
    const { 
      assignment_id,
      user_id,
      authorisation_id,
      authorisation_title,
      trainee_name,
      trainee_email 
    } = payload;

    if (!assignment_id || !user_id || !authorisation_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Get all users with Senior Management role
    const { data: seniorManagers, error } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        user_roles!inner(
          roles!inner(name)
        )
      `)
      .eq("user_roles.roles.name", "Senior Management");

    if (error) {
      console.error("Error fetching senior managers:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!seniorManagers || seniorManagers.length === 0) {
      console.log("No Senior Management users found");
      return NextResponse.json({ message: "No senior managers to notify" });
    }

    // Send notifications to all Senior Management users
    const notificationPromises = seniorManagers.map(async (manager) => {
      try {
        await notifyUser(
          manager.id,
          "authorisation_pending_approval",
          {
            title: "Authorisation Pending Approval",
            authorizationTitle: authorisation_title,
            learnerName: trainee_name,
            learner_email: trainee_email,
            assignmentId: assignment_id,
            url: `${process.env.NEXT_PUBLIC_SITE_URL}/app/admin/review/${assignment_id}`,
            event_id: `auth_pending_${assignment_id}_${Date.now()}`
          },
          {
            eventId: `auth_pending_${assignment_id}_${Date.now()}`
          }
        );
        
        console.log(`✅ Notified Senior Manager: ${manager.full_name} (${manager.email})`);
      } catch (error) {
        console.error(`❌ Failed to notify Senior Manager ${manager.full_name}:`, error);
      }
    });

    await Promise.allSettled(notificationPromises);

    return NextResponse.json({ 
      message: "Notifications sent",
      notified_count: seniorManagers.length
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
