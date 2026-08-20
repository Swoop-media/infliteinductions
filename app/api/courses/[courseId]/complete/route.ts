// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Database } from "@/lib/supabase/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordCourseCompletion } from "@/lib/training-history";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    const { assignmentId } = await request.json();
    
    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the user is an assessor for this course (user may have multiple roles)
    const { data: assessorRoles } = await supabase
      .from("course_assignments")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .in("role", ["onsite_assessor", "onsite_trainer", "trainer", "assessor"]);

    if (!assessorRoles || assessorRoles.length === 0) {
      return NextResponse.json({ error: "Not authorized to complete this course" }, { status: 403 });
    }

    // Get the assignment to verify it exists and get trainee info
    const { data: assignment, error: assignmentError } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id")
      .eq("id", assignmentId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Mark all modules as completed first
    const { data: modules, error: modulesError } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId);

    if (modulesError) {
      console.error("Error fetching modules:", modulesError);
      return NextResponse.json({ error: "Failed to fetch course modules" }, { status: 500 });
    }

    if (modules && modules.length > 0) {
      // Mark all modules as completed in assignment_progress
      const progressEntries = modules.map((module: any) => ({
        assignment_id: assignmentId,
        module_id: module.id,
        completed_at: new Date().toISOString()
      }));

      await supabase
        .from("assignment_progress")
        .upsert(progressEntries as any, {
          onConflict: "assignment_id,module_id"
        });
    }

    const completedAt = new Date().toISOString();
    try {
      await recordCourseCompletion({
        assignmentId,
        completedAt,
        actorId: user.id,
        reason: "completion",
        adminClient: supabaseAdmin(),
      });
    } catch (historyError: any) {
      console.error("Failed to preserve immutable course completion:", historyError);
      return NextResponse.json(
        { error: historyError?.message || "Could not preserve training history" },
        { status: 500 }
      );
    }

    // Update only after immutable history is durable.
    const { error: updateError } = await supabase
      .from("course_assignments")
      .update({ 
        assignment_status: 'completed',
        completed_at: completedAt
      } as any)
      .eq("id", assignmentId);

    if (updateError) {
      console.error("Error updating assignment status:", updateError);
      return NextResponse.json({ error: "Failed to complete course" }, { status: 500 });
    }

    // Try to call the RPC function to handle any additional completion logic
    try {
      await supabase.rpc("try_complete_assignment", { 
        p_assignment_id: assignmentId 
      });
    } catch (rpcError) {
      // This is optional, so we don't fail if it doesn't exist
      console.log("RPC function not available or failed:", rpcError);
    }

    // Automatically fix the trainee's authorisation statuses now that a course
    // was completed (moves them to in_progress / pending_approval as needed and
    // notifies Authorization Approvers). Uses the shared auto-fix module.
    try {
      const { autoFixAuthorisationAssignments } = await import("@/lib/authorizations/auto-fix");
      const autoFixResult = await autoFixAuthorisationAssignments({
        userId: assignment.user_id,
        trigger: "assessor_course_completion"
      });
      if (autoFixResult.fixed.length > 0) {
        console.log(`✅ Auto-fixed ${autoFixResult.fixed.length} authorisation assignment(s) for user ${assignment.user_id}`);
      }
      if (autoFixResult.errors.length > 0) {
        console.error("Auto-fix errors:", autoFixResult.errors);
      }
    } catch (autoFixError) {
      console.error("Authorisation auto-fix failed:", autoFixError);
      // Don't fail course completion if the auto-fix fails
    }

    return NextResponse.json({ 
      success: true, 
      message: "Course completed successfully" 
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}