// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Get current user and check permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Test data
    const testUserId = 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551'; // test user
    const courseId = '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e'; // INFLITE Driver Training
    const authId = 'a707ba0b-7ba3-4ee0-9937-c85e2b0e66b3'; // INFLITE Driver Authorisation

    console.log("Assigning test user to course and authorization...");

    // 1. Check if course assignment exists, if not create it
    const { data: existingCourse } = await supabase
      .from("course_assignments")
      .select("id")
      .eq("user_id", testUserId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (!existingCourse) {
      const { data: newCourseAssignment, error: courseError } = await supabase
        .from("course_assignments")
        .insert({
          user_id: testUserId,
          course_id: courseId,
          role: 'trainee',
          assignment_status: 'assigned',
          created_by: user.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (courseError) {
        console.error("Error creating course assignment:", courseError);
        return NextResponse.json({ 
          error: "Failed to create course assignment",
          details: courseError.message 
        }, { status: 500 });
      }

      console.log("Created course assignment:", newCourseAssignment.id);
    } else {
      console.log("Course assignment already exists:", existingCourse.id);
    }

    // 2. Check if authorization assignment exists, if not create it
    const { data: existingAuth } = await supabase
      .from("authorisation_assignments")
      .select("id")
      .eq("user_id", testUserId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee")
      .single();

    if (!existingAuth) {
      const { data: newAuthAssignment, error: authError } = await supabase
        .from("authorisation_assignments")
        .insert({
          user_id: testUserId,
          authorisation_id: authId,
          role: 'trainee',
          assignment_status: 'assigned',
          assigned_by: user.id,
          created_by: user.id,
          assigned_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (authError) {
        console.error("Error creating authorization assignment:", authError);
        return NextResponse.json({ 
          error: "Failed to create authorization assignment",
          details: authError.message 
        }, { status: 500 });
      }

      console.log("Created authorization assignment:", newAuthAssignment.id);
    } else {
      console.log("Authorization assignment already exists:", existingAuth.id);
    }

    // 3. Return current status
    const { data: courseStatus } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("user_id", testUserId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    const { data: authStatus } = await supabase
      .from("authorisation_assignments")
      .select("*")
      .eq("user_id", testUserId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee")
      .single();

    return NextResponse.json({
      success: true,
      message: "User assigned to course and authorization",
      course: {
        id: courseId,
        assignmentId: courseStatus?.id,
        status: courseStatus?.assignment_status
      },
      authorization: {
        id: authId,
        assignmentId: authStatus?.id,
        status: authStatus?.assignment_status
      }
    });

  } catch (error) {
    console.error("Assignment error:", error);
    return NextResponse.json({ 
      error: "Failed to assign user",
      details: error.message 
    }, { status: 500 });
  }
}