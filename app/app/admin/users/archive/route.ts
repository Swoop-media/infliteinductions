// @ts-nocheck
// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncUserToSafeflite } from "@/lib/webhooks/safeflite-sync";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
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

    console.log("Attempting to archive user:", userId);

    // Update the user's archived_at timestamp
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("Archive user error:", updateError);
      return NextResponse.json({ error: "Failed to archive user" }, { status: 500 });
    }

    console.log("Successfully archived user:", userId);

    // Fetch user profile to sync to SafeFLITE
    const { data: profile } = await supabase
      .from("profiles")
      .select("microsoft_id, email, full_name, job_description, department, created_at, updated_at, archived_at")
      .eq("id", userId)
      .single();

    if (profile) {
      await syncUserToSafeflite({
        microsoft_id: profile.microsoft_id,
        email: profile.email,
        full_name: profile.full_name,
        job_description: profile.job_description,
        department: profile.department,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        archived_at: profile.archived_at
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Archive user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
