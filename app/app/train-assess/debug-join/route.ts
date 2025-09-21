// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const supabaseService = supabaseAdmin();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const courseIds = [
    'bdc908f2-0346-4678-9b96-ba76a6dc591b',
    '54e82b81-b2db-49ee-b644-27e6b0ad4451', 
    'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
  ];

  // Test 1: Get raw assignments
  const { data: rawAssignments } = await supabaseService
    .from("course_assignments")
    .select("*")
    .eq("role", "trainee")
    .in("course_id", courseIds);

  // Test 2: Try with left join instead of inner join
  const { data: leftJoinAssignments } = await supabaseService
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      profiles(
        full_name,
        email
      )
    `)
    .eq("role", "trainee")
    .in("course_id", courseIds);

  // Test 3: Try getting profiles separately
  const userIds = rawAssignments?.map(a => a.user_id) || [];
  const { data: profiles } = await supabaseService
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  // Test 4: Try regular client with left join
  const { data: regularClientJoin } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      role,
      profiles(
        full_name,
        email
      )
    `)
    .eq("role", "trainee")
    .in("course_id", courseIds);

  return NextResponse.json({
    rawAssignments: {
      count: rawAssignments?.length || 0,
      data: rawAssignments
    },
    leftJoinAssignments: {
      count: leftJoinAssignments?.length || 0,
      data: leftJoinAssignments
    },
    profiles: {
      count: profiles?.length || 0,
      data: profiles
    },
    regularClientJoin: {
      count: regularClientJoin?.length || 0,
      data: regularClientJoin
    }
  });
}