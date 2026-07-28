// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    const adminClient = supabaseAdmin();

    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    const { data: { user: adminUser } } = await supabase.auth.getUser();
    if (!adminUser) {
      return NextResponse.json({ error: "Admin authentication failed" }, { status: 401 });
    }

    const results: Record<string, any> = {};

    const { data: courseAssignments } = await adminClient
      .from("course_assignments")
      .select("id, course_id")
      .eq("user_id", userId)
      .eq("role", "trainee");

    if (courseAssignments && courseAssignments.length > 0) {
      const assignmentIds = courseAssignments.map(a => a.id);
      const courseIds = courseAssignments.map(a => a.course_id);

      const { error: progressErr, count: progressCount } = await adminClient
        .from("assignment_progress")
        .delete()
        .in("assignment_id", assignmentIds);
      results.assignmentProgress = { deleted: !progressErr, error: progressErr?.message };

      const { error: reqErr } = await adminClient
        .from("requirement_responses")
        .delete()
        .in("assignment_id", assignmentIds);
      results.requirementResponses = { deleted: !reqErr, error: reqErr?.message };

      const { data: modules } = await adminClient
        .from("course_modules")
        .select("id")
        .in("course_id", courseIds);

      if (modules && modules.length > 0) {
        const moduleIds = modules.map(m => m.id);

        const { data: quizzes } = await adminClient
          .from("quizzes")
          .select("id")
          .in("module_id", moduleIds);

        if (quizzes && quizzes.length > 0) {
          const quizIds = quizzes.map(q => q.id);
          const { error: quizErr } = await adminClient
            .from("quiz_attempts")
            .delete()
            .in("quiz_id", quizIds)
            .eq("user_id", userId);
          results.quizAttempts = { deleted: !quizErr, error: quizErr?.message };
        }
      }

      const { error: courseAssignErr } = await adminClient
        .from("course_assignments")
        .update({
          assignment_status: "assigned",
          completed_at: null
        })
        .in("id", assignmentIds);
      results.courseAssignments = { reset: !courseAssignErr, count: assignmentIds.length, error: courseAssignErr?.message };

      const { error: enrollErr } = await adminClient
        .from("course_enrolments")
        .upsert(
          courseIds.map(cid => ({ user_id: userId, course_id: cid, status: "approved" })),
          { onConflict: "user_id,course_id", ignoreDuplicates: false }
        );
      results.courseEnrolments = { reset: !enrollErr, error: enrollErr?.message };
    }

    const { error: authAssignErr } = await adminClient
      .from("authorisation_assignments")
      .update({
        assignment_status: "assigned",
        completed_at: null
      })
      .eq("user_id", userId);
    results.authorisationAssignments = { reset: !authAssignErr, error: authAssignErr?.message };

    console.log(`Admin ${adminUser.id} wiped all training progress for user ${userId}`, results);

    return NextResponse.json({
      success: true,
      message: "All training progress wiped successfully",
      userId,
      adminId: adminUser.id,
      results
    });

  } catch (error) {
    console.error("Error wiping user progress:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
