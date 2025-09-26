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

    // Verify user has admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role_name")
      .eq("user_id", user.id)
      .in("role_name", ["Admin", "Senior Management"]);

    if (!roles || roles.length === 0) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const fixes = [];
    const errors = [];

    // Get all authorization assignments that are in 'assigned' status
    const { data: assignments, error: assignError } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status
      `)
      .eq("role", "trainee")
      .eq("assignment_status", "assigned");

    if (assignError) {
      console.error("Error fetching assignments:", assignError);
      return NextResponse.json({ error: "Failed to fetch authorization assignments" }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No authorization assignments need updating",
        fixes: [],
        summary: { updated_to_pending: 0, total: 0 }
      });
    }

    // Check each assignment to see if all courses are completed
    for (const assignment of assignments) {
      // Get all courses for this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", assignment.authorisation_id);

      if (!authCourses || authCourses.length === 0) continue;

      const courseIds = authCourses.map(ac => ac.course_id);

      // Check if all courses are completed for this user
      const { data: completedCourses } = await supabase
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", assignment.user_id)
        .eq("role", "trainee")
        .eq("assignment_status", "completed")
        .in("course_id", courseIds);

      const allCompleted = completedCourses?.length === courseIds.length && courseIds.length > 0;

      if (allCompleted) {
        // Update to pending_approval
        const { error: updateError } = await supabase
          .from("authorisation_assignments")
          .update({
            assignment_status: 'pending_approval',
            completed_at: new Date().toISOString()
          })
          .eq("id", assignment.id);

        if (updateError) {
          errors.push(`Failed to update auth ${assignment.authorisation_id} for user ${assignment.user_id}: ${updateError.message}`);
        } else {
          fixes.push({
            action: "updated_to_pending",
            user_id: assignment.user_id,
            authorisation_id: assignment.authorisation_id
          });
        }
      }
    }

    // Get user details for the fixes
    const fixedUserIds = [...new Set(fixes.map(f => f.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", fixedUserIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // Get authorization details
    const fixedAuthIds = [...new Set(fixes.map(f => f.authorisation_id))];
    const { data: authorisations } = await supabase
      .from("authorisations")
      .select("id, title")
      .in("id", fixedAuthIds);

    const authMap = new Map((authorisations || []).map(a => [a.id, a]));

    // Format the fixes with user and auth details
    const detailedFixes = fixes.map(fix => ({
      ...fix,
      user_name: profileMap.get(fix.user_id)?.full_name || 'Unknown',
      user_email: profileMap.get(fix.user_id)?.email || 'Unknown',
      authorisation_title: authMap.get(fix.authorisation_id)?.title || 'Unknown'
    }));

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} authorization assignments`,
      fixes: detailedFixes,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        updated_to_pending: fixes.filter(f => f.action === "updated_to_pending").length,
        total: fixes.length
      }
    });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 });
  }
}