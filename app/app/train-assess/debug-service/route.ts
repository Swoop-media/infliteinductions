// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const supabaseService = supabaseAdmin();
  
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
  
  // Try with regular client
  const { data: regularQuery } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      profiles!inner(
        full_name,
        email
      )
    `)
    .eq("role", "trainee")
    .in("course_id", trainerCourseIds);

  // Try with service role client (bypasses RLS)
  const { data: serviceQuery } = await supabaseService
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      profiles!inner(
        full_name,
        email
      )
    `)
    .eq("role", "trainee")
    .in("course_id", trainerCourseIds);

  return NextResponse.json({
    currentUser: {
      id: user.id,
      email: user.email
    },
    trainerCourseIds,
    regularClient: {
      count: regularQuery?.length || 0,
      data: regularQuery?.map(t => ({
        user_id: t.user_id,
        name: t.profiles?.full_name,
        email: t.profiles?.email,
        course_id: t.course_id
      }))
    },
    serviceClient: {
      count: serviceQuery?.length || 0,
      data: serviceQuery?.map(t => ({
        user_id: t.user_id,
        name: t.profiles?.full_name,
        email: t.profiles?.email,
        course_id: t.course_id
      }))
    }
  });
}