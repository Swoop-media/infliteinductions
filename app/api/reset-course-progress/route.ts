// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAuthorisationCompletion, recordCourseCompletion } from "@/lib/training-history";

export async function POST(request: NextRequest) {
  try {
    const { assignmentId, courseId, userId } = await request.json();
    
    if (!assignmentId && !courseId && !userId) {
      return NextResponse.json({ 
        error: "At least one of assignmentId, courseId, or userId is required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    const adminClient = supabaseAdmin();
    
    // Get current user and check permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or trainer by checking course assignments
    const { data: trainerRoles } = await supabase
      .from("course_assignments")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["trainer", "onsite_trainer", "onsite_assessor", "assessor"]);
    
    // Also check user_roles table for admin roles
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["Admin", "Trainers", "Senior Management"]);

    const hasPermission = (trainerRoles && trainerRoles.length > 0) || (adminRoles && adminRoles.length > 0);

    if (!hasPermission) {
      console.log("Permission check failed - trainer roles:", trainerRoles, "admin roles:", adminRoles);
      return NextResponse.json({ 
        error: "You need Admin or Trainer permissions to reset course progress" 
      }, { status: 403 });
    }

    let targetAssignmentId = assignmentId;
    
    // If we don't have assignmentId but have courseId and userId, find the assignment
    if (!targetAssignmentId && courseId && userId) {
      const { data: assignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", userId)
        .eq("role", "trainee")
        .single();
      
      if (assignment) {
        targetAssignmentId = assignment.id;
      }
    }

    if (!targetAssignmentId) {
      return NextResponse.json({ 
        error: "Could not find assignment to reset" 
      }, { status: 404 });
    }

    // Get the assignment details
    const { data: assignment, error: assignmentError } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id, assignment_status, completed_at, attempt_number")
      .eq("id", targetAssignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ 
        error: "Assignment not found" 
      }, { status: 404 });
    }

    console.log("Resetting course progress for assignment:", targetAssignmentId);

    if (assignment.assignment_status === "completed" && assignment.completed_at) {
      try {
        await recordCourseCompletion({
          assignmentId: targetAssignmentId,
          completedAt: assignment.completed_at,
          actorId: user.id,
          reason: "reset",
          adminClient,
        });
      } catch (historyError: any) {
        console.error("Could not preserve course before progress reset:", historyError);
        return NextResponse.json(
          { error: historyError?.message || "Could not preserve completed training before reset" },
          { status: 500 }
        );
      }
    }

    // 1. Delete assignment progress
    const { error: progressError } = await adminClient
      .from("assignment_progress")
      .delete()
      .eq("assignment_id", targetAssignmentId);

    if (progressError) {
      console.error("Error deleting assignment progress:", progressError);
    }

    // 2. Reset course assignment status
    const { error: courseAssignError } = await adminClient
      .from("course_assignments")
      .update({
        assignment_status: 'assigned',
        completed_at: null,
        attempt_number: (assignment.attempt_number || 1) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetAssignmentId);

    if (courseAssignError) {
      console.error("Error resetting course assignment:", courseAssignError);
    }

    // 3. Delete requirement responses for this assignment
    const { error: reqError } = await adminClient
      .from("requirement_responses")
      .delete()
      .eq("assignment_id", targetAssignmentId);

    if (reqError) {
      console.error("Error deleting requirement responses:", reqError);
    }

    // Quiz attempts are immutable evidence. New attempts are tied to the
    // incremented assignment attempt number instead of deleting old rows.

    // 5. Reset authorization assignment status if needed
    const { data: authAssignments } = await adminClient
      .from("authorisation_assignments")
      .select("id, authorisation_id, assignment_status, completed_at, attempt_number")
      .eq("user_id", assignment.user_id);

    if (authAssignments && authAssignments.length > 0) {
      for (const authAssign of authAssignments) {
        // Check if this authorization includes this course
        const { data: authCourses } = await adminClient
          .from("authorisation_courses")
          .select("course_id")
          .eq("authorisation_id", authAssign.authorisation_id)
          .eq("course_id", assignment.course_id);

        if (authCourses && authCourses.length > 0) {
          if (authAssign.assignment_status === "completed" && authAssign.completed_at) {
            await recordAuthorisationCompletion({
              assignmentId: authAssign.id,
              completedAt: authAssign.completed_at,
              actorId: user.id,
              reason: "retake",
              adminClient,
            });
          }
          // Reset this authorization assignment
          await adminClient
            .from("authorisation_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              attempt_number: (authAssign.attempt_number || 1) + 1,
            })
            .eq("id", authAssign.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Course progress reset successfully",
      details: {
        assignmentId: targetAssignmentId,
        courseId: assignment.course_id,
        userId: assignment.user_id
      }
    });

  } catch (error) {
    console.error("Reset course progress error:", error);
    return NextResponse.json({ 
      error: "Failed to reset course progress",
      details: error.message 
    }, { status: 500 });
  }
}