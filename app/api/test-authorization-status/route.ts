// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Test data
    const userId = 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551'; // test user
    const courseId = '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e'; // INFLITE Driver Training
    const authId = 'a707ba0b-7ba3-4ee0-9937-c85e2b0e66b3'; // INFLITE Driver Authorisation
    
    // 1. Check course assignment status
    const { data: courseAssignment } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    // 2. Check all courses in authorization
    const { data: authCourses } = await supabase
      .from("authorisation_courses")
      .select("course_id")
      .eq("authorisation_id", authId);

    const courseIds = authCourses?.map(ac => ac.course_id) || [];

    // 3. Check completion status for all courses
    const { data: allAssignments } = await supabase
      .from("course_assignments")
      .select("course_id, assignment_status")
      .eq("user_id", userId)
      .eq("role", "trainee")
      .in("course_id", courseIds);

    // 4. Check authorization assignment
    const { data: authAssignment } = await supabase
      .from("authorisation_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee")
      .single();

    const completedCount = allAssignments?.filter(a => a.assignment_status === 'completed').length || 0;
    const allCompleted = completedCount === courseIds.length && courseIds.length > 0;

    const result = {
      testCourse: {
        id: courseId,
        status: courseAssignment?.assignment_status || 'NOT FOUND',
        completedAt: courseAssignment?.completed_at
      },
      authorization: {
        id: authId,
        totalCourses: courseIds.length,
        completedCourses: completedCount,
        allCoursesComplete: allCompleted,
        courses: allAssignments || []
      },
      authorizationAssignment: {
        exists: !!authAssignment,
        status: authAssignment?.assignment_status || 'NOT FOUND',
        completedAt: authAssignment?.completed_at
      },
      action: null
    };

    // If all courses are complete but authorization is not pending/complete, update it
    if (allCompleted && authAssignment && 
        authAssignment.assignment_status !== 'pending_approval' && 
        authAssignment.assignment_status !== 'completed') {
      
      const { data: updated, error: updateError } = await supabase
        .from("authorisation_assignments")
        .update({
          assignment_status: 'pending_approval',
          completed_at: new Date().toISOString()
        })
        .eq("id", authAssignment.id)
        .select()
        .single();

      if (updateError) {
        result.action = { error: updateError.message };
      } else {
        result.action = { 
          success: true, 
          message: "Authorization updated to pending_approval",
          updated 
        };
      }
    } else if (!authAssignment) {
      result.action = { error: "No authorization assignment found for user" };
    } else {
      result.action = { 
        message: `No update needed. Status is already: ${authAssignment.assignment_status}` 
      };
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Test error:", error);
    return NextResponse.json({ 
      error: "Failed to test authorization status",
      details: error.message 
    }, { status: 500 });
  }
}