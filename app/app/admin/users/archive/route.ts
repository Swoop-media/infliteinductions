
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Use service role for admin operations
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log("Attempting to archive user:", user_id);

    // Update the user's archived_at timestamp
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", user_id);

    if (updateError) {
      console.error("Archive user error:", updateError);
      return NextResponse.json({ error: "Failed to archive user" }, { status: 500 });
    }

    console.log("Successfully archived user:", user_id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Archive user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
