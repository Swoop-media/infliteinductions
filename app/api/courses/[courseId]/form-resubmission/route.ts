// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { recordCourseCompletion } from "@/lib/training-history";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const supabase = await createSupabaseServer();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = supabaseAdmin();

    const { data: assignment, error: assignmentError } = await adminClient
      .from("course_assignments")
      .select("id, user_id, course_id, assignment_status, completed_at, attempt_number")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .eq("role", "trainee")
      .maybeSingle();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (assignment.assignment_status !== "completed") {
      return NextResponse.json({
        message: "Course is not completed, no reassessment needed",
        reassessment_triggered: false
      });
    }

    const { data: course } = await adminClient
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    // Select the newest published immutable version and derive the course
    // definition from its snapshot. Never read the live course_modules table.
    const { data: latestVersion, error: latestVersionError } = await adminClient
      .from("course_versions")
      .select("id, course_id, version_number, title, snapshot, status, published_at")
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      console.error("Failed to load the latest published course version:", latestVersionError);
      return NextResponse.json(
        { error: "Failed to load the latest published course version" },
        { status: 500 }
      );
    }

    const latestSnapshot = latestVersion?.snapshot;
    if (
      !latestVersion?.id ||
      !latestSnapshot ||
      !latestSnapshot.course ||
      !Array.isArray(latestSnapshot.modules)
    ) {
      return NextResponse.json(
        { error: "No valid published course version is available for reassessment" },
        { status: 500 }
      );
    }

    const courseTitle = latestSnapshot.course?.title || course?.title || "Unknown Course";

    try {
      await recordCourseCompletion({
        assignmentId: assignment.id,
        completedAt: assignment.completed_at,
        actorId: user.id,
        reason: "form_resubmission",
        adminClient,
      });
    } catch (historyError: any) {
      return NextResponse.json(
        { error: historyError?.message || "Could not preserve completed training before reassessment" },
        { status: 500 }
      );
    }

    // Start a fresh attempt: clear ALL live progress and requirement responses
    // for the old live assignment. Quiz attempts remain immutable evidence and
    // are preserved by the completion history captured above.
    const { error: progressResetError } = await adminClient
      .from("assignment_progress")
      .delete()
      .eq("assignment_id", assignment.id);
    if (progressResetError) {
      console.error("Failed to clear assignment progress:", progressResetError);
      return NextResponse.json(
        { error: "Failed to clear the previous assignment progress" },
        { status: 500 }
      );
    }

    const { error: responsesResetError } = await adminClient
      .from("requirement_responses")
      .delete()
      .eq("assignment_id", assignment.id);
    if (responsesResetError) {
      console.error("Failed to clear requirement responses:", responsesResetError);
      return NextResponse.json(
        { error: "Failed to clear the previous requirement responses" },
        { status: 500 }
      );
    }

    const { error: resetAssignmentError } = await adminClient
      .from("course_assignments")
      .update({
        assignment_status: "assigned",
        completed_at: null,
        course_version_id: latestVersion.id,
        attempt_number: (assignment.attempt_number || 1) + 1,
      })
      .eq("id", assignment.id);
    if (resetAssignmentError) {
      console.error("Failed to start form reassessment attempt:", resetAssignmentError);
      return NextResponse.json(
        { error: "Failed to start a new assessment attempt" },
        { status: 500 }
      );
    }

    console.log(`Reset assignment status and assessment progress for assignment ${assignment.id}, course ${courseId}`);

    const { data: assessors } = await adminClient
      .from("course_assignments")
      .select("user_id")
      .eq("course_id", courseId)
      .eq("role", "onsite_assessor");

    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const learnerName = userProfile?.full_name || userProfile?.email || "A learner";

    if (assessors && assessors.length > 0) {
      const notifyPromises = assessors.map(assessor =>
        notifyUser(
          assessor.user_id,
          "form_resubmitted",
          {
            title: "Equipment form resubmitted - Assessment required",
            learnerName,
            learner_email: userProfile?.email,
            courseTitle,
            course_title: courseTitle,
            url: "/app/train-assess"
          }
        ).catch(err => {
          console.error(`Failed to notify assessor ${assessor.user_id}:`, err);
        })
      );

      await Promise.all(notifyPromises);
      console.log(`Notified ${assessors.length} assessor(s) about form resubmission for course ${courseTitle}`);
    }

    return NextResponse.json({
      success: true,
      reassessment_triggered: true,
      assessors_notified: assessors?.length || 0,
      message: `Course moved back to assessment. ${assessors?.length || 0} assessor(s) notified.`
    });

  } catch (error) {
    console.error("Form resubmission API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
