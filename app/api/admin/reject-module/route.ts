// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { recordAuthorisationCompletion, recordCourseCompletion } from "@/lib/training-history";

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
      .select("id, assignment_status, completed_at, attempt_number")
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

    if (courseAssignment.assignment_status === "completed" && courseAssignment.completed_at) {
      try {
        await recordCourseCompletion({
          assignmentId: courseAssignment.id,
          completedAt: courseAssignment.completed_at,
          actorId: adminUser.id,
          reason: "module_rejected",
          adminClient,
        });
      } catch (historyError: any) {
        return NextResponse.json(
          { error: historyError?.message || "Could not preserve completed training before reopening the module" },
          { status: 500 }
        );
      }
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

    // Quiz attempts are immutable evidence. Removing module progress is enough
    // to allow a new quiz attempt.

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
          attempt_number: (courseAssignment.attempt_number || 1) + 1,
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
        .select("id, assignment_status, completed_at, attempt_number")
        .eq("id", assignmentId)
        .single();

      if (authAssignment && authAssignment.assignment_status === "completed") {
        try {
          await recordAuthorisationCompletion({
            assignmentId: authAssignment.id,
            completedAt: authAssignment.completed_at,
            actorId: adminUser.id,
            reason: "retake",
            adminClient,
          });
        } catch (historyError: any) {
          return NextResponse.json(
            { error: historyError?.message || "Could not preserve the completed authorisation before reopening it" },
            { status: 500 }
          );
        }
        const { error: updateAuthError } = await adminClient
          .from("authorisation_assignments")
          .update({
            assignment_status: "in_progress",
            completed_at: null,
            attempt_number: (authAssignment.attempt_number || 1) + 1,
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

    // Get admin's name and course title for notifications
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", adminUser.id)
      .single();

    const { data: course } = await adminClient
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    // Get trainee's name for assessor notification
    const { data: traineeProfile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    // Import notification dispatcher
    const { notifyUser } = await import("@/lib/notifications/dispatcher");

    // Send notification to the trainee
    try {
      await notifyUser(userId, "module_rejected", {
        moduleTitle: moduleTitle || "Module",
        courseTitle: course?.title || "Course",
        rejectionReason: rejectionReason,
        rejectedBy: adminProfile?.full_name || adminUser.email,
        moduleType: moduleType,
        url: `/app/train-assess`,
      });

      console.log(`✅ Teams notification sent to trainee ${userId}`);
    } catch (notifyError) {
      console.error("Failed to send trainee notification:", notifyError);
      // Don't block the rejection process if notification fails
    }

    // Check if course has onsite assessment modules and notify assessors
    try {
      // Check if the course has any onsite assessment modules
      const { data: assessmentModules } = await adminClient
        .from("course_modules")
        .select("id")
        .eq("course_id", courseId)
        .eq("type", "onsite_assessment")
        .limit(1);

      if (assessmentModules && assessmentModules.length > 0) {
        // Get all assessors for this course
        const { data: assessors } = await adminClient
          .from("course_assignments")
          .select("user_id")
          .eq("course_id", courseId)
          .in("role", ["onsite_assessor", "assessor"])
          .neq("user_id", adminUser.id); // Don't notify the admin who rejected it

        if (assessors && assessors.length > 0) {
          console.log(`📧 Found ${assessors.length} assessors to notify for course ${courseId}`);
          
          // Send notification to each assessor
          for (const assessor of assessors) {
            try {
              await notifyUser(assessor.user_id, "module_rejected", {
                moduleTitle: moduleTitle || "Module",
                courseTitle: course?.title || "Course",
                rejectionReason: rejectionReason,
                rejectedBy: adminProfile?.full_name || adminUser.email,
                moduleType: moduleType,
                learnerName: traineeProfile?.full_name || traineeProfile?.email || "Trainee",
                url: `/app/train-assess`,
                isAssessorNotification: true, // Flag to potentially customize message
              });

              console.log(`✅ Teams notification sent to assessor ${assessor.user_id}`);
            } catch (assessorNotifyError) {
              console.error(`Failed to notify assessor ${assessor.user_id}:`, assessorNotifyError);
              // Continue notifying other assessors even if one fails
            }
          }
        }
      }
    } catch (assessorError) {
      console.error("Failed to check/notify assessors:", assessorError);
      // Don't block the rejection process if assessor notification fails
    }

    // Post to Teams channels via webhook
    try {
      const { postToAuthChannels } = await import("@/lib/teams/channel-webhook");

      let authTitle = "Authorization";
      if (assignmentId) {
        const { data: authAssign } = await adminClient
          .from("authorisation_assignments")
          .select("authorisations(title)")
          .eq("id", assignmentId)
          .single();
        authTitle = (authAssign?.authorisations as any)?.title || authTitle;
      }

      await postToAuthChannels({
        type: "rejected",
        authorizationTitle: authTitle,
        learnerName: traineeProfile?.full_name || traineeProfile?.email || "Unknown",
        approverOrRejector: adminProfile?.full_name || adminUser.email || "Unknown",
        moduleTitle: moduleTitle || "Module",
        courseTitle: course?.title || "Course",
        rejectionReason: rejectionReason,
        url: assignmentId ? `/app/admin/review/${assignmentId}` : `/app/train-assess`,
      }, { eventKey: `channel_rejected_${assignmentId || userId}_${moduleId}_${new Date().toISOString().split("T")[0]}` });
      console.log("✅ Module rejection posted to Teams channels");
    } catch (webhookError) {
      console.error("Failed to post rejection to Teams channels:", webhookError);
    }

    console.log(
      `Module ${moduleId} rejected by ${adminUser.id} for user ${userId}. Reason: ${rejectionReason}`
    );

    // Audit trail (best-effort)
    try {
      const { logUserAudit } = await import("@/lib/audit");
      await logUserAudit({
        userId,
        actorId: adminUser.id,
        action: "module_rejected",
        details: {
          course_title: course?.title ?? null,
          module_title: moduleTitle ?? null,
          reason: rejectionReason || null,
        },
      });
    } catch (auditErr) {
      console.error("Audit log failed for module rejection:", auditErr);
    }

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