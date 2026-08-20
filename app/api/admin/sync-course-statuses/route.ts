// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { recordCourseCompletion } from "@/lib/training-history";

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: assignments, error: assignError } = await supabase
      .from("course_assignments")
      .select("id, course_id, assignment_status, completed_at")
      .eq("user_id", userId)
      .eq("role", "trainee")
      .not("assignment_status", "eq", "completed");

    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No incomplete course assignments found for this user",
        fixed: 0,
      });
    }

    const courseIds = assignments.map((a) => a.course_id);

    const [
      { data: allModules, error: modulesError },
      { data: allProgress, error: progressError },
    ] = await Promise.all([
      supabase.from("course_modules").select("id, course_id").in("course_id", courseIds),
      supabase.from("assignment_progress").select("assignment_id, module_id").in("assignment_id", assignments.map((a) => a.id)),
    ]);

    if (modulesError || progressError) {
      return NextResponse.json({
        error: "Failed to fetch module or progress data",
        details: modulesError?.message || progressError?.message,
      }, { status: 500 });
    }

    const courseModuleMap = new Map<string, string[]>();
    (allModules || []).forEach((m) => {
      const existing = courseModuleMap.get(m.course_id) || [];
      existing.push(m.id);
      courseModuleMap.set(m.course_id, existing);
    });

    const assignmentProgressMap = new Map<string, Set<string>>();
    (allProgress || []).forEach((p) => {
      const existing = assignmentProgressMap.get(p.assignment_id) || new Set();
      existing.add(p.module_id);
      assignmentProgressMap.set(p.assignment_id, existing);
    });

    const fixes = [];

    for (const assignment of assignments) {
      const moduleIds = courseModuleMap.get(assignment.course_id) || [];
      const completedModuleIds = assignmentProgressMap.get(assignment.id) || new Set();

      if (moduleIds.length === 0) continue;

      const allCompleted = moduleIds.every((id) => completedModuleIds.has(id));

      if (allCompleted) {
        const completedAt = assignment.completed_at || new Date().toISOString();
        await recordCourseCompletion({
          assignmentId: assignment.id,
          completedAt,
          reason: "status_repair",
          adminClient: supabase,
        });

        const { error: updateError } = await supabase
          .from("course_assignments")
          .update({
            assignment_status: "completed",
            completed_at: completedAt,
          })
          .eq("id", assignment.id);

        if (!updateError) {
          fixes.push({
            assignmentId: assignment.id,
            courseId: assignment.course_id,
            previousStatus: assignment.assignment_status,
            newStatus: "completed",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} course assignment(s)`,
      fixed: fixes.length,
      totalChecked: assignments.length,
      details: fixes,
    });
  } catch (error: any) {
    console.error("Sync course statuses error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
