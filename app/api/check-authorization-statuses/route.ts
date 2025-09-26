// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // This can be called by a cron job or manually by admins
    // Check if user is admin (optional - remove this check if you want it to be callable by cron)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    const updatedCount = { total: 0, successful: 0, failed: 0 };
    const details = [];

    // Get all authorization assignments that are in 'assigned' status
    const { data: assignments, error: assignError } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status,
        authorisations!inner(
          id,
          title
        )
      `)
      .eq("role", "trainee")
      .eq("assignment_status", "assigned");

    if (assignError) {
      console.error("Error fetching assignments:", assignError);
      return NextResponse.json({ 
        error: "Failed to fetch authorization assignments",
        details: assignError.message 
      }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending authorization status updates needed",
        updated: updatedCount
      });
    }

    // Check each assignment
    for (const assignment of assignments) {
      updatedCount.total++;
      
      // Get all courses for this authorization
      const { data: authCourses, error: coursesError } = await supabase
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", assignment.authorisation_id);

      if (coursesError || !authCourses || authCourses.length === 0) {
        updatedCount.failed++;
        details.push({
          user_id: assignment.user_id,
          auth_id: assignment.authorisation_id,
          error: "Failed to fetch authorization courses"
        });
        continue;
      }

      const courseIds = authCourses.map(ac => ac.course_id);

      // Check if all courses are completed for this user
      const { data: completedCourses, error: completedError } = await supabase
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", assignment.user_id)
        .eq("role", "trainee")
        .eq("assignment_status", "completed")
        .in("course_id", courseIds);

      if (completedError) {
        updatedCount.failed++;
        details.push({
          user_id: assignment.user_id,
          auth_id: assignment.authorisation_id,
          error: "Failed to fetch completed courses"
        });
        continue;
      }

      const completedCount = completedCourses?.length || 0;
      const totalCount = courseIds.length;
      const allCompleted = completedCount === totalCount && totalCount > 0;

      if (allCompleted) {
        // Update authorization status to pending_approval
        const { error: updateError } = await supabase
          .from("authorisation_assignments")
          .update({
            assignment_status: 'pending_approval',
            completed_at: new Date().toISOString()
          })
          .eq("id", assignment.id);

        if (updateError) {
          updatedCount.failed++;
          details.push({
            user_id: assignment.user_id,
            auth_id: assignment.authorisation_id,
            auth_title: (assignment as any).authorisations?.title,
            error: `Failed to update: ${updateError.message}`
          });
        } else {
          updatedCount.successful++;
          details.push({
            user_id: assignment.user_id,
            auth_id: assignment.authorisation_id,
            auth_title: (assignment as any).authorisations?.title,
            status: "Updated to pending_approval",
            completed_courses: `${completedCount}/${totalCount}`
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Checked ${updatedCount.total} authorizations, updated ${updatedCount.successful} to pending_approval`,
      summary: updatedCount,
      details: details
    });

  } catch (error) {
    console.error("Check authorization statuses error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}