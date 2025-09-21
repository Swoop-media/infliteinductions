// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  
  // Get current user and verify they're an admin or trainer
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Define the assignments to create
  const assignments = [
    // Henry Morgan assignments
    {
      user_email: 'henry.morgan@inflite.nz',
      course_name: 'Sigma passenger Harnessing and Briefing',
      course_id: 'bdc908f2-0346-4678-9b96-ba76a6dc591b'
    },
    // Peter Hansen assignments
    {
      user_email: 'peter.hansen@inflite.nz',
      course_name: 'Sigma Packing',
      course_id: '54e82b81-b2db-49ee-b644-27e6b0ad4451'
    },
    {
      user_email: 'peter.hansen@inflite.nz',
      course_name: 'Sigma 25 jump checks',
      course_id: 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
    },
    {
      user_email: 'peter.hansen@inflite.nz',
      course_name: 'Sigma passenger Harnessing and Briefing',
      course_id: 'bdc908f2-0346-4678-9b96-ba76a6dc591b'
    }
  ];

  const results = [];

  for (const assignment of assignments) {
    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", assignment.user_email)
      .single();

    if (!profile) {
      results.push({
        ...assignment,
        status: 'error',
        message: 'User not found'
      });
      continue;
    }

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from("course_assignments")
      .select("id")
      .eq("user_id", profile.id)
      .eq("course_id", assignment.course_id)
      .eq("role", "trainee")
      .single();

    if (existingAssignment) {
      results.push({
        ...assignment,
        user_name: profile.full_name,
        status: 'exists',
        message: 'Assignment already exists'
      });
      continue;
    }

    // Create the assignment using RPC
    const { data, error } = await supabase
      .rpc('assign_course_user', {
        p_course_id: assignment.course_id,
        p_user_id: profile.id,
        p_role: 'trainee',
        p_created_by: user.id
      });

    if (error) {
      results.push({
        ...assignment,
        user_name: profile.full_name,
        status: 'error',
        message: error.message
      });
    } else {
      results.push({
        ...assignment,
        user_name: profile.full_name,
        status: 'success',
        message: 'Trainee assignment created'
      });
    }
  }

  // Verify assignments were created
  const { data: allTrainees } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      profiles!inner(full_name, email),
      courses!inner(title)
    `)
    .eq("role", "trainee")
    .in("course_id", ['bdc908f2-0346-4678-9b96-ba76a6dc591b', '54e82b81-b2db-49ee-b644-27e6b0ad4451', 'c7e65bae-bb3d-49d0-b992-fe4c09b15451']);

  return NextResponse.json({
    message: 'Trainee assignments processed',
    results,
    verification: {
      total_trainees: allTrainees?.length || 0,
      trainees: allTrainees?.map(t => ({
        name: t.profiles?.full_name,
        email: t.profiles?.email,
        course: t.courses?.title
      }))
    }
  });
}