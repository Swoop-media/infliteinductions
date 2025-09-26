// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Database } from "@/lib/supabase/types";

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

    // Update the course assignment status to completed
    const { error: updateError } = await supabase
      .from("course_assignments")
      .update({ 
        assignment_status: 'completed',
        completed_at: new Date().toISOString()
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

    // Check if authorization should be marked as pending_approval
    // First, find all authorizations that include this course
    const { data: authCourses } = await supabase
      .from("authorisation_courses")
      .select("authorisation_id")
      .eq("course_id", courseId);

    if (authCourses && authCourses.length > 0) {
      console.log(`Course ${courseId} is part of ${authCourses.length} authorization(s)`);
      
      // For each authorization, check if all courses are completed
      for (const authCourse of authCourses) {
        const authId = authCourse.authorisation_id;
        
        // Get all courses for this authorization
        const { data: allAuthCourses } = await supabase
          .from("authorisation_courses")
          .select("course_id")
          .eq("authorisation_id", authId);

        const courseIds = allAuthCourses?.map(ac => ac.course_id) || [];
        
        console.log(`Checking authorization ${authId}: ${courseIds.length} total courses`);

        // Check if all courses are completed for this user
        const { data: completedCourses } = await supabase
          .from("course_assignments")
          .select("course_id")
          .eq("user_id", assignment.user_id)
          .eq("role", "trainee")
          .eq("assignment_status", "completed")
          .in("course_id", courseIds);

        const allCompleted = completedCourses?.length === courseIds.length && courseIds.length > 0;
        
        console.log(`Authorization ${authId}: ${completedCourses?.length}/${courseIds.length} courses completed`);

        if (allCompleted) {
          // Check if there's an existing authorization assignment
          const { data: existingAuth } = await supabase
            .from("authorisation_assignments")
            .select("id, assignment_status")
            .eq("user_id", assignment.user_id)
            .eq("authorisation_id", authId)
            .eq("role", "trainee")
            .single();

          if (existingAuth && 
              existingAuth.assignment_status !== 'completed' && 
              existingAuth.assignment_status !== 'pending_approval') {
            // Update authorization status to pending_approval
            // Note: Removing updated_at to avoid PostgREST schema cache issues
            const { error: authUpdateError } = await supabase
              .from("authorisation_assignments")
              .update({
                assignment_status: 'pending_approval',
                completed_at: new Date().toISOString()
              })
              .eq("id", existingAuth.id);

            if (authUpdateError) {
              console.error("Error updating authorization status:", authUpdateError);
            } else {
              console.log(`Authorization ${authId} updated to pending_approval for user ${assignment.user_id}`);
            }
          } else {
            console.log(`Authorization already in status: ${existingAuth?.assignment_status}`);
          }
        }
      }
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