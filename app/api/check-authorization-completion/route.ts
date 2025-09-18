// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { userId, courseId } = await request.json();
    
    if (!userId || !courseId) {
      return NextResponse.json({ 
        error: "userId and courseId are required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Get current user and check permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or trainer
    const { data: trainerRoles } = await supabase
      .from("course_assignments")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["trainer", "onsite_trainer", "onsite_assessor", "assessor"]);
    
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["Admin", "Trainers", "Senior Management"]);

    const hasPermission = (trainerRoles && trainerRoles.length > 0) || (adminRoles && adminRoles.length > 0);

    if (!hasPermission) {
      return NextResponse.json({ 
        error: "You need Admin or Trainer permissions" 
      }, { status: 403 });
    }

    console.log("Manually checking authorization completion for:", { userId, courseId });

    // Call the database function to check authorization completion
    const { data, error } = await supabase.rpc('check_authorization_completion', {
      p_user_id: userId,
      p_course_id: courseId
    });

    if (error) {
      console.error("Error calling check_authorization_completion:", error);
      return NextResponse.json({ 
        error: "Failed to check authorization completion",
        details: error.message 
      }, { status: 500 });
    }

    // Get the updated authorization status
    const { data: authAssignments } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        authorisation_id,
        assignment_status,
        completed_at,
        authorisations!inner(title)
      `)
      .eq("user_id", userId)
      .eq("role", "trainee");

    return NextResponse.json({
      success: true,
      message: "Authorization completion check completed",
      authorizations: authAssignments || []
    });

  } catch (error) {
    console.error("Check authorization completion error:", error);
    return NextResponse.json({ 
      error: "Failed to check authorization completion",
      details: error.message 
    }, { status: 500 });
  }
}