// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

// Cache schema type to avoid duplicate queries
let schemaType: 'new' | 'old' | null = null;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRoute();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let notifications = null;
    let error = null;

    // Use cached schema type or detect it once
    if (schemaType === 'old') {
      // Use old schema directly
      ({ data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)); // Limit results for better performance
    } else if (schemaType === 'new') {
      // Use new schema directly
      ({ data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)); // Limit results for better performance
    } else {
      // First time - detect schema type
      ({ data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50));

      if (error && (error.code === "42703" || error.message.includes("Could not find") || error.message.includes("column"))) {
        // Cache that we're using old schema
        schemaType = 'old';
        ({ data: notifications, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50));
      } else if (!error) {
        // Cache that we're using new schema
        schemaType = 'new';
      }
    }

    if (error) {
      console.error("Error fetching notifications:", error);
      // Reset schema cache on error
      schemaType = null;
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
    // Reset schema cache on error
    schemaType = null;
    return NextResponse.json({ 
      error: "Server error", 
      message: e.message 
    }, { status: 500 });
  }
}