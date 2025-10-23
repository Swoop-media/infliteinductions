// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const userId = resolvedParams.id;
    
    const supabase = await createSupabaseRoute();
    
    // Check if the requesting user is an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Fetch notifications for the specific user
    // Try both recipient_id and user_id for compatibility
    let { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    // If recipient_id fails, try user_id (for newer schema)
    if (error && (error.code === "42703" || error.message.includes("column"))) {
      ({ data: notifications, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100));
    }

    if (error) {
      console.error("Error fetching user notifications:", error);
      return NextResponse.json({ 
        error: "Failed to fetch notifications",
        details: error.message 
      }, { status: 500 });
    }

    // Transform notifications to include both old and new schema formats
    const transformedNotifications = (notifications || []).map(notification => {
      // Ensure we have a consistent format
      const baseNotification = {
        id: notification.id,
        type: notification.type,
        created_at: notification.created_at,
        read: notification.read || notification.is_read || false,
        read_at: notification.read_at || null
      };

      // Handle payload (old schema) or direct fields (new schema)
      if (notification.payload) {
        return {
          ...baseNotification,
          payload: notification.payload
        };
      } else {
        // For newer schema, create a payload from individual fields
        return {
          ...baseNotification,
          payload: {
            title: notification.title,
            body: notification.body,
            ...notification.data
          }
        };
      }
    });

    return NextResponse.json({ 
      notifications: transformedNotifications,
      count: transformedNotifications.length 
    });
  } catch (e: any) {
    console.error("Error fetching user notifications:", e);
    return NextResponse.json({ 
      error: "Server error", 
      message: e.message 
    }, { status: 500 });
  }
}