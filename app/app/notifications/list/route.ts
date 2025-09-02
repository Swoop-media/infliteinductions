
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRoute();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try new schema first (user_id, title, body)
    let { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // If that fails, try old schema (recipient_id, payload)
    if (error && (error.code === "42703" || error.message.includes("Could not find") || error.message.includes("column"))) {
      ({ data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false }));
    }

    if (error) {
      console.error("Error fetching notifications:", error);
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }

    // Transform notifications to a consistent format
    const transformedNotifications = (notifications || []).map(notification => {
      // Handle both new and old schema
      if (notification.title) {
        // New schema
        return {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          read: notification.read_at ? true : (notification.is_read || false),
          created_at: notification.created_at
        };
      } else {
        // Old schema with payload
        const payload = notification.payload || {};
        return {
          id: notification.id,
          type: notification.type,
          title: payload.title || "Notification",
          body: payload.body || "",
          data: payload,
          read: notification.read_at ? true : (notification.read || notification.is_read || false),
          created_at: notification.created_at
        };
      }
    });

    return NextResponse.json({ notifications: transformedNotifications });
  } catch (e: any) {
    console.error("Notifications list error:", e);
    return NextResponse.json({ 
      error: "Server error", 
      message: e.message 
    }, { status: 500 });
  }
}
