// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has admin role using RPC function
    const { data: hasAdminRole, error: roleError } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    // Also check for Senior Management if not admin
    let hasSeniorRole = false;
    if (!hasAdminRole) {
      const { data: seniorCheck } = await supabase.rpc("has_role", {
        uid: user.id,
        role_name: "Senior Management"
      });
      hasSeniorRole = !!seniorCheck;
    }

    if (!hasAdminRole && !hasSeniorRole) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { userId, authId, expectedStatus } = await request.json();

    if (!userId || !authId || !expectedStatus) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Update the authorization assignment
    const updateData: any = {
      assignment_status: expectedStatus
    };

    if (expectedStatus === 'pending_approval') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("authorisation_assignments")
      .update(updateData)
      .eq("user_id", userId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee");

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json({ error: "Failed to update authorization" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Authorization updated successfully",
      userId,
      authId,
      newStatus: expectedStatus
    });

  } catch (error: any) {
    console.error("Fix single authorization error:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred" },
      { status: 500 }
    );
  }
}