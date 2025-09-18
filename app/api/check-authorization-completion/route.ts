// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { userId, courseId } = await request.json();
    
    if (!userId || !courseId) {
      return NextResponse.json({ 
        error: "userId and courseId are required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Get current user and check permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or trainer
    const { data: trainerRoles } = await supabase
      .from("course_assignments")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["trainer", "onsite_trainer", "onsite_assessor", "assessor"]);
    
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["Admin", "Trainers", "Senior Management"]);

    const hasPermission = (trainerRoles && trainerRoles.length > 0) || (adminRoles && adminRoles.length > 0);

    if (!hasPermission) {
      return NextResponse.json({ 
        error: "You need Admin or Trainer permissions" 
      }, { status: 403 });
    }

    console.log("Manually checking authorization completion for:", { userId, courseId });

    // First check if course is completed
    const { data: courseAssignment } = await supabase
      .from("course_assignments")
      .select("assignment_status")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (!courseAssignment || courseAssignment.assignment_status !== 'completed') {
      return NextResponse.json({
        error: "Course is not completed yet",
        details: `Course status: ${courseAssignment?.assignment_status || 'not found'}`
      }, { status: 400 });
    }

    // Find all authorizations that include this course
    const { data: authCourses } = await supabase
      .from("authorisation_courses")
      .select("authorisation_id")
      .eq("course_id", courseId);

    if (!authCourses || authCourses.length === 0) {
      return NextResponse.json({
        error: "No authorizations found for this course"
      }, { status: 404 });
    }

    // For each authorization, check if all courses are completed
    for (const authCourse of authCourses) {
      const authId = authCourse.authorisation_id;

      // Get all courses for this authorization
      const { data: allAuthCourses } = await supabase
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", authId);

      const courseIds = allAuthCourses?.map(ac => ac.course_id) || [];
      
      console.log(`Checking authorization ${authId}:`, {
        totalCourses: courseIds.length,
        courses: courseIds
      });

      // Check if all courses are completed
      const { data: completedCourses } = await supabase
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", userId)
        .eq("role", "trainee")
        .eq("assignment_status", "completed")
        .in("course_id", courseIds);

      const allCompleted = completedCourses?.length === courseIds.length && courseIds.length > 0;
      
      console.log(`Authorization ${authId} completion status:`, {
        totalRequired: courseIds.length,
        totalCompleted: completedCourses?.length || 0,
        allCompleted,
        completedCourseIds: completedCourses?.map(c => c.course_id) || []
      });

      if (allCompleted) {
        // First check if there's an existing authorization assignment
        const { data: existingAuth, error: checkError } = await supabase
          .from("authorisation_assignments")
          .select("id, assignment_status")
          .eq("user_id", userId)
          .eq("authorisation_id", authId)
          .eq("role", "trainee")
          .single();

        if (existingAuth && existingAuth.assignment_status !== 'completed' && existingAuth.assignment_status !== 'pending_approval') {
          // Update authorization status to pending_approval
          const { data: updateData, error: updateError } = await supabase
            .from("authorisation_assignments")
            .update({
              assignment_status: 'pending_approval',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", existingAuth.id)
            .select();

          if (updateError) {
            console.error("Error updating authorization status:", updateError);
          } else {
            console.log(`Authorization ${authId} updated to pending_approval for user ${userId}`, updateData);
          }
        } else {
          console.log(`Authorization already in status: ${existingAuth?.assignment_status}`);
        }
      }
    }

    // Get the updated authorization status
    const { data: authAssignments } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        authorisation_id,
        assignment_status,
        completed_at,
        authorisations!inner(title)
      `)
      .eq("user_id", userId)
      .eq("role", "trainee");

    return NextResponse.json({
      success: true,
      message: "Authorization completion check completed",
      authorizations: authAssignments || []
    });

  } catch (error) {
    console.error("Check authorization completion error:", error);
    return NextResponse.json({ 
      error: "Failed to check authorization completion",
      details: error.message 
    }, { status: 500 });
  }
}