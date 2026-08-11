// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Use admin client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: "Server configuration error" 
      }, { status: 500 });
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      // Hard cap on Supabase HTTP round-trips so connection blips can't hang
      // requests indefinitely and saturate the VM (Aug 2026 outages).
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
      },
    });
    
    // For this setup endpoint, we'll use a default assigner ID
    const assignerId = process.env.DEFAULT_ASSIGNER_ID || 'd23e5879-46f0-456f-a75f-06c0f0f4bc06'; // Default admin user ID

    // Test data
    const testUserId = process.env.TEST_USER_ID || 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551'; // test user
    const courseId = process.env.INFLITE_DRIVER_TRAINING_COURSE_ID || '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e'; // INFLITE Driver Training
    const authId = process.env.INFLITE_DRIVER_AUTH_ID || 'a707ba0b-7ba3-4ee0-9937-c85e2b0e66b3'; // INFLITE Driver Authorisation

    console.log("Assigning test user to course and authorization...");

    // Guard: never assign learners to unpublished (draft/archived) courses —
    // draft-course content is hidden from learners and surfaces as broken quizzes.
    const { data: courseStatusRow, error: courseStatusError } = await supabaseAdmin
      .from("courses")
      .select("id, title, status")
      .eq("id", courseId)
      .maybeSingle();
    if (courseStatusError || !courseStatusRow) {
      return NextResponse.json({ error: "Could not verify course status" }, { status: 500 });
    }
    if (courseStatusRow.status !== "published") {
      return NextResponse.json({
        error: `Cannot assign unpublished course "${courseStatusRow.title}" (${courseStatusRow.status}). Publish the course first.`
      }, { status: 400 });
    }

    // 1. Check if course assignment exists, if not create it
    const { data: existingCourse } = await supabaseAdmin
      .from("course_assignments")
      .select("id")
      .eq("user_id", testUserId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (!existingCourse) {
      const { data: newCourseAssignment, error: courseError } = await supabaseAdmin
        .from("course_assignments")
        .insert({
          user_id: testUserId,
          course_id: courseId,
          role: 'trainee',
          assignment_status: 'assigned',
          created_by: assignerId,
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
    const { data: existingAuth } = await supabaseAdmin
      .from("authorisation_assignments")
      .select("id")
      .eq("user_id", testUserId)
      .eq("authorisation_id", authId)
      .eq("role", "trainee")
      .single();

    if (!existingAuth) {
      const { data: newAuthAssignment, error: authError } = await supabaseAdmin
        .from("authorisation_assignments")
        .insert({
          user_id: testUserId,
          authorisation_id: authId,
          role: 'trainee',
          assignment_status: 'assigned',
          assigned_by: assignerId,
          created_by: assignerId,
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
    const { data: courseStatus } = await supabaseAdmin
      .from("course_assignments")
      .select("*")
      .eq("user_id", testUserId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    const { data: authStatus } = await supabaseAdmin
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