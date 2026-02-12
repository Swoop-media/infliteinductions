// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/dispatcher";

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
      .select("id, user_id, course_id, assignment_status")
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

    const courseTitle = course?.title || "Unknown Course";

    const { data: modules } = await adminClient
      .from("course_modules")
      .select("id, type")
      .eq("course_id", courseId);

    const assessmentModules = modules?.filter(m => m.type === "onsite_assessment") || [];

    if (assessmentModules.length > 0) {
      const assessmentModuleIds = assessmentModules.map(m => m.id);

      await adminClient
        .from("assignment_progress")
        .delete()
        .eq("assignment_id", assignment.id)
        .in("module_id", assessmentModuleIds);
    }

    await adminClient
      .from("course_assignments")
      .update({
        assignment_status: "assigned",
        completed_at: null
      })
      .eq("id", assignment.id);

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
