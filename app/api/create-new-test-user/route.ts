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
      }
    });

    const { email, fullName } = await request.json();
    
    if (!email || !fullName) {
      return NextResponse.json({ 
        error: "Email and full name are required" 
      }, { status: 400 });
    }

    console.log("Creating new test user:", email);

    // 1. Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: 'TestUser123!', // Default password for test user
      email_confirm: true
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      return NextResponse.json({ 
        error: "Failed to create user",
        details: authError.message 
      }, { status: 500 });
    }

    console.log("Created auth user:", authUser.user.id);

    // 2. Create profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authUser.user.id,
        email: email,
        full_name: fullName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      console.error("Error creating profile:", profileError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ 
        error: "Failed to create profile",
        details: profileError.message 
      }, { status: 500 });
    }

    // 3. Assign to course
    const courseId = process.env.DEFAULT_COURSE_ID || '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e'; // INFLITE Driver Training
    const defaultAdminId = process.env.DEFAULT_ADMIN_ID || 'd23e5879-46f0-456f-a75f-06c0f0f4bc06';
    
    const { data: courseAssignment, error: courseError } = await supabaseAdmin
      .from("course_assignments")
      .insert({
        user_id: authUser.user.id,
        course_id: courseId,
        role: 'trainee',
        assignment_status: 'assigned',
        created_by: defaultAdminId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (courseError) {
      console.error("Error creating course assignment:", courseError);
    }

    // 4. Assign to authorization
    const authId = process.env.DEFAULT_AUTHORIZATION_ID || 'a707ba0b-7ba3-4ee0-9937-c85e2b0e66b3'; // INFLITE Driver Authorisation
    const { data: authAssignment, error: authError2 } = await supabaseAdmin
      .from("authorisation_assignments")
      .insert({
        user_id: authUser.user.id,
        authorisation_id: authId,
        role: 'trainee',
        assignment_status: 'assigned',
        assigned_by: defaultAdminId,
        created_by: defaultAdminId,
        assigned_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (authError2) {
      console.error("Error creating authorization assignment:", authError2);
    }

    return NextResponse.json({
      success: true,
      message: "New test user created successfully",
      user: {
        id: authUser.user.id,
        email: email,
        fullName: fullName,
        temporaryPassword: 'TestUser123!'
      },
      assignments: {
        course: courseAssignment ? 'Assigned' : 'Failed',
        authorization: authAssignment ? 'Assigned' : 'Failed'
      }
    });

  } catch (error) {
    console.error("Error creating test user:", error);
    return NextResponse.json({ 
      error: "Failed to create test user",
      details: error.message 
    }, { status: 500 });
  }
}