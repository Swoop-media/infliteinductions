// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { getCurrentCourseVersion, recordAuthorisationCompletion, recordCourseCompletion } from "@/lib/training-history";

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

    const { data: courseAssignments, error: courseAssignmentsError } = await adminClient
      .from("course_assignments")
      .select("id, course_id, assignment_status, completed_at, attempt_number")
      .eq("user_id", userId)
      .eq("role", "trainee");
    if (courseAssignmentsError) throw courseAssignmentsError;

    if (courseAssignments && courseAssignments.length > 0) {
      const assignmentIds = courseAssignments.map(a => a.id);
      const courseIds = courseAssignments.map(a => a.course_id);
      const latestCourseVersions = new Map(
        await Promise.all(
          [...new Set(courseIds)].map(async (courseId) => {
            const version = await getCurrentCourseVersion(adminClient, courseId);
            return [courseId, version.id] as const;
          })
        )
      );

      // This destructive maintenance action must fail before deleting anything
      // if even one completed course cannot be preserved.
      for (const assignment of courseAssignments) {
        if (assignment.assignment_status === "completed" && assignment.completed_at) {
          await recordCourseCompletion({
            assignmentId: assignment.id,
            completedAt: assignment.completed_at,
            actorId: adminUser.id,
            reason: "admin_full_reset",
            adminClient,
          });
        }
      }

      const { error: progressErr, count: progressCount } = await adminClient
        .from("assignment_progress")
        .delete()
        .in("assignment_id", assignmentIds);
      results.assignmentProgress = { deleted: !progressErr, error: progressErr?.message };
      if (progressErr) throw progressErr;

      const { error: reqErr } = await adminClient
        .from("requirement_responses")
        .delete()
        .in("assignment_id", assignmentIds);
      results.requirementResponses = { deleted: !reqErr, error: reqErr?.message };
      if (reqErr) throw reqErr;

      // Quiz attempts are evidence and are never deleted. Each reset gets a new
      // attempt number so subsequent attempts cannot be confused with old ones.
      const resetErrors: string[] = [];
      for (const assignment of courseAssignments) {
        const { error } = await adminClient
          .from("course_assignments")
          .update({
            assignment_status: "assigned",
            completed_at: null,
            course_version_id: latestCourseVersions.get(assignment.course_id),
            attempt_number: (assignment.attempt_number || 1) + 1,
          })
          .eq("id", assignment.id);
        if (error) resetErrors.push(error.message);
      }
      results.courseAssignments = {
        reset: resetErrors.length === 0,
        count: assignmentIds.length,
        error: resetErrors.join("; ") || undefined,
      };
      if (resetErrors.length > 0) {
        throw new Error(`Failed to start every new course attempt: ${resetErrors.join("; ")}`);
      }
      results.quizAttempts = { deleted: false, preservedAsEvidence: true };

      const { error: enrollErr } = await adminClient
        .from("course_enrolments")
        .upsert(
          courseIds.map(cid => ({ user_id: userId, course_id: cid, status: "approved" })),
          { onConflict: "user_id,course_id", ignoreDuplicates: false }
        );
      results.courseEnrolments = { reset: !enrollErr, error: enrollErr?.message };
      if (enrollErr) throw enrollErr;
    }

    const { data: authAssignments, error: authLoadError } = await adminClient
      .from("authorisation_assignments")
      .select("id, assignment_status, completed_at, attempt_number")
      .eq("user_id", userId)
      .eq("role", "trainee");
    if (authLoadError) throw authLoadError;

    for (const assignment of authAssignments || []) {
      if (assignment.assignment_status === "completed" && assignment.completed_at) {
        await recordAuthorisationCompletion({
          assignmentId: assignment.id,
          completedAt: assignment.completed_at,
          actorId: adminUser.id,
          reason: "admin_full_reset",
          adminClient,
        });
      }
    }

    const authResetErrors: string[] = [];
    for (const assignment of authAssignments || []) {
      const { error } = await adminClient
        .from("authorisation_assignments")
        .update({
          assignment_status: "assigned",
          completed_at: null,
          attempt_number: (assignment.attempt_number || 1) + 1,
        })
        .eq("id", assignment.id);
      if (error) authResetErrors.push(error.message);
    }
    results.authorisationAssignments = {
      reset: authResetErrors.length === 0,
      error: authResetErrors.join("; ") || undefined,
    };
    if (authResetErrors.length > 0) {
      throw new Error(`Failed to reset every authorisation: ${authResetErrors.join("; ")}`);
    }

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
