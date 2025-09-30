// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const authorizationId = searchParams.get('authorizationId');
    
    if (!userId || !authorizationId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Check if user is authorized to view this data (must be admin or the user themselves)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client for fetching data
    const adminClient = supabaseAdmin();

    // Get authorization assignment
    const { data: authAssignment } = await adminClient
      .from("authorisation_assignments")
      .select(`
        id,
        assignment_status,
        completed_at,
        authorisations!inner(title)
      `)
      .eq("user_id", userId)
      .eq("authorisation_id", authorizationId)
      .single();

    // Get courses for this authorization
    const { data: authCourses } = await adminClient
      .from("authorisation_courses")
      .select(`
        course_id,
        order_index,
        courses!inner(
          id,
          title,
          status
        )
      `)
      .eq("authorisation_id", authorizationId)
      .order("order_index", { ascending: true });

    if (!authCourses || authCourses.length === 0) {
      return NextResponse.json({ courses: [] });
    }

    // Get user's course assignments for these courses
    const courseIds = authCourses.map(ac => ac.course_id);
    const { data: userCourseAssignments } = await adminClient
      .from("course_assignments")
      .select(`
        id,
        course_id,
        assignment_status,
        completed_at
      `)
      .eq("user_id", userId)
      .eq("role", "trainee")
      .in("course_id", courseIds);

    // Create a map of course assignments
    const courseAssignmentMap = new Map(
      (userCourseAssignments || []).map(ca => [ca.course_id, ca])
    );

    // Process courses with their completion status
    const coursesWithDetails = authCourses.map(ac => {
      const courseData = ac.courses as any;
      const assignment = courseAssignmentMap.get(ac.course_id);
      
      return {
        course_id: ac.course_id,
        course_title: courseData.title,
        completed: assignment?.assignment_status === 'completed',
        completed_at: assignment?.completed_at,
        assignment_status: assignment?.assignment_status || 'not_started'
      };
    });

    return NextResponse.json({
      authorization_id: authorizationId,
      authorization_title: authAssignment?.authorisations?.title || 'Unknown Authorization',
      assignment_status: authAssignment?.assignment_status,
      completed_at: authAssignment?.completed_at,
      courses: coursesWithDetails
    });

  } catch (error) {
    console.error('Error fetching authorization details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch authorization details' },
      { status: 500 }
    );
  }
}