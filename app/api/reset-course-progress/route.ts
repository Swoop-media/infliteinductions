// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { assignmentId, courseId, userId } = await request.json();
    
    if (!assignmentId && !courseId && !userId) {
      return NextResponse.json({ 
        error: "At least one of assignmentId, courseId, or userId is required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
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
      .select("id, user_id, course_id")
      .eq("id", targetAssignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ 
        error: "Assignment not found" 
      }, { status: 404 });
    }

    console.log("Resetting course progress for assignment:", targetAssignmentId);

    // 1. Delete assignment progress
    const { error: progressError } = await supabase
      .from("assignment_progress")
      .delete()
      .eq("assignment_id", targetAssignmentId);

    if (progressError) {
      console.error("Error deleting assignment progress:", progressError);
    }

    // 2. Reset course assignment status
    const { error: courseAssignError } = await supabase
      .from("course_assignments")
      .update({
        assignment_status: 'assigned',
        completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetAssignmentId);

    if (courseAssignError) {
      console.error("Error resetting course assignment:", courseAssignError);
    }

    // 3. Delete requirement responses for this assignment
    const { error: reqError } = await supabase
      .from("requirement_responses")
      .delete()
      .eq("assignment_id", targetAssignmentId);

    if (reqError) {
      console.error("Error deleting requirement responses:", reqError);
    }

    // 4. Delete quiz attempts for this user and course
    // First get all modules for this course
    const { data: modules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignment.course_id);

    if (modules && modules.length > 0) {
      const moduleIds = modules.map(m => m.id);
      
      // Get quizzes for these modules
      const { data: quizzes } = await supabase
        .from("quizzes")
        .select("id")
        .in("module_id", moduleIds);

      if (quizzes && quizzes.length > 0) {
        const quizIds = quizzes.map(q => q.id);
        
        // Delete quiz attempts
        const { error: quizError } = await supabase
          .from("quiz_attempts")
          .delete()
          .in("quiz_id", quizIds)
          .eq("user_id", assignment.user_id);

        if (quizError) {
          console.error("Error deleting quiz attempts:", quizError);
        }
      }
    }

    // 5. Reset authorization assignment status if needed
    const { data: authAssignments } = await supabase
      .from("authorisation_assignments")
      .select("id, authorisation_id")
      .eq("user_id", assignment.user_id);

    if (authAssignments && authAssignments.length > 0) {
      for (const authAssign of authAssignments) {
        // Check if this authorization includes this course
        const { data: authCourses } = await supabase
          .from("authorisation_courses")
          .select("course_id")
          .eq("authorisation_id", authAssign.authorisation_id)
          .eq("course_id", assignment.course_id);

        if (authCourses && authCourses.length > 0) {
          // Reset this authorization assignment
          await supabase
            .from("authorisation_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null
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