// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Delete request body:", body);
    
    const { userId } = body;

    if (!userId) {
      console.log("No userId provided in request");
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Check environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing environment variables:", {
        url: !!process.env.SUPABASE_URL,
        serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Use service role for admin operations
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log("Attempting to delete user:", userId);

    // Delete from auth.users (this will cascade to profiles)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Delete user error:", deleteError);
      return NextResponse.json({ 
        error: "Failed to delete user", 
        details: deleteError.message 
      }, { status: 500 });
    }

    console.log("Successfully deleted user:", userId);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}