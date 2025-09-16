import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    const searchParams = request.nextUrl.searchParams;
    const assignmentId = searchParams.get("assignmentId");
    
    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required in query params" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", details: authError }, { status: 401 });
    }

    // Debug: Check user's roles for this course
    const { data: userRoles, error: rolesError } = await supabase
      .from("course_assignments")
      .select("role, assignment_status")
      .eq("user_id", user.id)
      .eq("course_id", courseId);

    // Debug: Check the trainee assignment
    const { data: traineeAssignment, error: traineeError } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("id", assignmentId)
      .single();

    // Debug: Check assignment progress
    const { data: progress, error: progressError } = await supabase
      .from("assignment_progress")
      .select("*")
      .eq("assignment_id", assignmentId);

    // Debug: Check course modules
    const { data: modules, error: modulesError } = await supabase
      .from("course_modules")
      .select("id, title, type")
      .eq("course_id", courseId)
      .eq("type", "onsite_assessment");

    return NextResponse.json({
      debug: true,
      currentUser: {
        id: user.id,
        email: user.email
      },
      userRolesForCourse: userRoles || [],
      rolesError: rolesError?.message,
      traineeAssignment: traineeAssignment || null,
      traineeError: traineeError?.message,
      progressCount: progress?.length || 0,
      progressError: progressError?.message,
      assessmentModulesCount: modules?.length || 0,
      modules: modules || [],
      modulesError: modulesError?.message,
      checksToPass: {
        hasAssessorRole: userRoles?.some(r => ["onsite_assessor", "onsite_trainer", "trainer", "assessor"].includes(r.role)),
        traineeAssignmentExists: !!traineeAssignment,
        traineeAssignmentIsTrainee: traineeAssignment?.role === "trainee",
        traineeAssignmentCorrectCourse: traineeAssignment?.course_id === courseId
      }
    });
  } catch (error: any) {
    console.error("Test API error:", error);
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}