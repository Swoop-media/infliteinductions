
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    
    // Find unprocessed pending approval notifications
    const { data: pendingNotifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "authorisation_pending_approval")
      .eq("read", false)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Error fetching pending notifications:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return NextResponse.json({ 
        message: "No pending notifications to process",
        processed: 0 
      });
    }

    let processedCount = 0;
    const notificationIds: string[] = [];

    for (const notification of pendingNotifications) {
      try {
        // Send Teams notification using existing dispatcher
        await notifyUser(
          notification.recipient_id,
          notification.type,
          notification.payload,
          {
            eventId: notification.payload?.event_id,
            skipTeams: false
          }
        );

        notificationIds.push(notification.id);
        processedCount++;
        
        console.log(`✅ Processed notification ${notification.id} for user ${notification.recipient_id}`);
      } catch (error) {
        console.error(`❌ Failed to process notification ${notification.id}:`, error);
      }
    }

    // Mark notifications as processed
    if (notificationIds.length > 0) {
      await supabase
        .from("notifications")
        .update({ processed_at: new Date().toISOString() })
        .in("id", notificationIds);
    }

    return NextResponse.json({ 
      message: `Processed ${processedCount} notifications`,
      processed: processedCount,
      total: pendingNotifications.length
    });

  } catch (error) {
    console.error("Process notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
