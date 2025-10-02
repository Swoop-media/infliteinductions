// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const {
      assignmentId,
      courseId,
      moduleId,
      moduleTitle,
      moduleType,
      userId,
      rejectionReason,
    } = await request.json();

    const supabase = await createSupabaseServer();
    const adminClient = supabaseAdmin();

    // Check if the current user is an admin or authorization approver
    const isApprover = await hasRole("Authorization Approver");
    const isAdmin = await hasRole("Admin");
    const isTrainerAssessor = await hasRole("Trainers and Assessors");
    
    if (!isApprover && !isAdmin && !isTrainerAssessor) {
      return NextResponse.json(
        { error: "Unauthorized - Approval access required" },
        { status: 403 }
      );
    }

    // Get the admin user for logging purposes
    const {
      data: { user: adminUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !adminUser) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }

    // Get the course assignment
    const { data: courseAssignment, error: assignmentError } = await adminClient
      .from("course_assignments")
      .select("id, assignment_status")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (assignmentError || !courseAssignment) {
      console.error("Error fetching course assignment:", assignmentError);
      return NextResponse.json(
        { error: "Course assignment not found" },
        { status: 404 }
      );
    }

    // Delete the module progress to mark it as incomplete
    const { error: deleteProgressError } = await adminClient
      .from("assignment_progress")
      .delete()
      .eq("assignment_id", courseAssignment.id)
      .eq("module_id", moduleId);

    if (deleteProgressError) {
      console.error("Error deleting module progress:", deleteProgressError);
      return NextResponse.json(
        { error: "Failed to reset module progress" },
        { status: 500 }
      );
    }

    // If it's a quiz module, also delete quiz attempts for this user and module
    if (moduleType === "digital_assessment_quiz") {
      // First get the quiz for this module
      const { data: quiz } = await adminClient
        .from("quizzes")
        .select("id")
        .eq("module_id", moduleId)
        .single();

      if (quiz) {
        // Delete quiz attempts
        const { error: deleteQuizError } = await adminClient
          .from("quiz_attempts")
          .delete()
          .eq("user_id", userId)
          .eq("quiz_id", quiz.id);

        if (deleteQuizError) {
          console.error("Error deleting quiz attempts:", deleteQuizError);
        }
      }
    }

    // If it's an onsite module, delete requirement responses
    if (moduleType === "onsite_training" || moduleType === "onsite_assessment") {
      const { error: deleteResponsesError } = await adminClient
        .from("requirement_responses")
        .delete()
        .eq("assignment_id", courseAssignment.id)
        .eq("module_id", moduleId);

      if (deleteResponsesError) {
        console.error("Error deleting requirement responses:", deleteResponsesError);
      }
    }

    // Update course assignment status if it was completed
    if (courseAssignment.assignment_status === "completed") {
      const { error: updateStatusError } = await adminClient
        .from("course_assignments")
        .update({
          assignment_status: "in_progress",
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", courseAssignment.id);

      if (updateStatusError) {
        console.error("Error updating course status:", updateStatusError);
      }
    }

    // Also update the authorization assignment if it exists
    if (assignmentId) {
      const { data: authAssignment } = await adminClient
        .from("authorisation_assignments")
        .select("id, assignment_status")
        .eq("id", assignmentId)
        .single();

      if (authAssignment && authAssignment.assignment_status === "completed") {
        const { error: updateAuthError } = await adminClient
          .from("authorisation_assignments")
          .update({
            assignment_status: "in_progress",
            completed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", assignmentId);

        if (updateAuthError) {
          console.error("Error updating authorization status:", updateAuthError);
        }
      }
    }

    // Store the rejection record in a rejection log table (create if doesn't exist)
    // For now, we'll store it in the notifications as a rejection notification
    const { error: rejectionLogError } = await adminClient
      .from("notifications")
      .insert({
        recipient_id: userId,
        type: "module_rejected",
        payload: {
          moduleId,
          moduleTitle,
          moduleType,
          courseId,
          rejectionReason,
          rejectedBy: adminUser.email,
          rejectedAt: new Date().toISOString(),
        },
        read: false,
        created_at: new Date().toISOString(),
      });

    if (rejectionLogError) {
      console.error("Error logging rejection:", rejectionLogError);
    }

    // Send notification to the trainee
    try {
      // Get admin's name
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", adminUser.id)
        .single();

      // Get course title
      const { data: course } = await adminClient
        .from("courses")
        .select("title")
        .eq("id", courseId)
        .single();

      const { notifyUser } = await import("@/lib/notifications/dispatcher");
      
      await notifyUser(userId, "module_rejected", {
        moduleTitle: moduleTitle || "Module",
        courseTitle: course?.title || "Course",
        rejectionReason: rejectionReason,
        rejectedBy: adminProfile?.full_name || adminUser.email,
        moduleType: moduleType,
        url: `/app/train-assess`,
      });

      console.log(`✅ Rejection notification sent to trainee ${userId}`);
    } catch (notifyError) {
      console.error("Failed to send rejection notification:", notifyError);
      // Don't block the rejection process if notification fails
    }

    console.log(
      `Module ${moduleId} rejected by ${adminUser.id} for user ${userId}. Reason: ${rejectionReason}`
    );

    return NextResponse.json({
      success: true,
      message: "Module progress rejected successfully",
      moduleId,
      userId,
      rejectedBy: adminUser.id,
    });
  } catch (error) {
    console.error("Error in reject module API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}