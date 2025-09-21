// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get Connor's trainer/assessor assignments
  const { data: trainerRoles } = await supabase
    .from("course_assignments")
    .select("course_id, role")
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"]);

  const trainerCourseIds = [...new Set(trainerRoles?.map(a => a.course_id) || [])];
  
  // Get ALL trainee assignments for these courses (not just Connor's)
  const { data: allTrainees } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      created_at,
      profiles!inner(
        full_name,
        email
      ),
      courses!inner(
        title
      )
    `)
    .eq("role", "trainee")
    .in("course_id", trainerCourseIds);

  // Get profiles for Henry and Peter specifically
  const { data: henryProfile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .ilike("email", "%henry.morgan%")
    .single();

  const { data: peterProfile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .ilike("email", "%peter.hansen%")
    .single();

  // Check if Henry and Peter have ANY course assignments
  let henryAssignments = null;
  let peterAssignments = null;

  if (henryProfile) {
    const { data } = await supabase
      .from("course_assignments")
      .select("*, courses(title)")
      .eq("user_id", henryProfile.id);
    henryAssignments = data;
  }

  if (peterProfile) {
    const { data } = await supabase
      .from("course_assignments")
      .select("*, courses(title)")
      .eq("user_id", peterProfile.id);
    peterAssignments = data;
  }

  // Check enrolments table too
  const { data: allEnrolments } = await supabase
    .from("course_enrolments")
    .select(`
      id,
      user_id,
      course_id,
      status,
      profiles!inner(
        full_name,
        email
      ),
      courses!inner(
        title
      )
    `)
    .in("course_id", trainerCourseIds);

  return NextResponse.json({
    currentUser: {
      id: user.id,
      email: user.email
    },
    trainerCourseIds,
    allTraineesInCourses: {
      count: allTrainees?.length || 0,
      trainees: allTrainees?.map(t => ({
        user_id: t.user_id,
        name: t.profiles?.full_name,
        email: t.profiles?.email,
        course: t.courses?.title,
        course_id: t.course_id
      }))
    },
    henryMorgan: {
      profile: henryProfile,
      assignments: henryAssignments
    },
    peterHansen: {
      profile: peterProfile,
      assignments: peterAssignments
    },
    enrolments: {
      count: allEnrolments?.length || 0,
      data: allEnrolments?.map(e => ({
        user_id: e.user_id,
        name: e.profiles?.full_name,
        email: e.profiles?.email,
        course: e.courses?.title,
        status: e.status
      }))
    }
  });
}