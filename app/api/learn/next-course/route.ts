import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ type: 'none' }, { status: 401 });
    }

    const { currentCourseId, currentAuthorizationId } = await request.json() as {
      currentCourseId: string;
      currentAuthorizationId?: string;
    };

    // First, check if there are other courses in the current authorization
    if (currentAuthorizationId) {
      const { data: authCourses } = await supabase
        .from('authorisation_courses')
        .select(`
          course_id,
          order_index,
          courses!inner(id, title, status)
        `)
        .eq('authorisation_id', currentAuthorizationId)
        .eq('courses.status', 'published')
        .order('order_index', { ascending: true });

      if (authCourses && authCourses.length > 0) {
        // Get all course assignments for this user
        const { data: courseAssignments } = await supabase
          .from('course_assignments')
          .select(`
            course_id,
            status,
            completed_at
          `)
          .eq('user_id', user.id);

        // Find the next course that either:
        // 1. Hasn't been started yet (no assignment)
        // 2. Is in progress but not completed
        // Skip the current course
        for (const authCourse of authCourses as any[]) {
          if (authCourse.course_id === currentCourseId) continue;

          // Check if user has an assignment for this course
          const courseAssignment = courseAssignments?.find(
            (ca: any) => ca.course_id === authCourse.course_id
          );

          // If no assignment or assignment is not completed, this is a valid next course
          if (!courseAssignment || !courseAssignment.completed_at) {
            // Get the first module to check if it's accessible
            const { data: modules } = await supabase
              .from('course_modules')
              .select('id, type')
              .eq('course_id', authCourse.course_id)
              .order('order_index', { ascending: true })
              .limit(1);

            // Only suggest courses that have digital modules the user can work on
            // Skip if the first module is onsite training/assessment
            const firstModule = modules?.[0];
            if (firstModule && 
                firstModule.type !== 'onsite_training' && 
                firstModule.type !== 'onsite_assessment') {
              return NextResponse.json({
                type: 'course',
                id: authCourse.course_id,
                title: authCourse.courses?.title || 'Next Course'
              });
            }
          }
        }
      }
    }

    // If no suitable courses in current authorization, check other authorizations
    const { data: allAssignments } = await supabase
      .from('authorisation_assignments')
      .select(`
        id,
        authorisation_id,
        assignment_status,
        authorisations!inner(
          id,
          title,
          status
        )
      `)
      .eq('user_id', user.id)
      .in('assignment_status', ['pending', 'in_progress', 'assigned'])
      .neq('authorisation_id', currentAuthorizationId || '')
      .order('created_at', { ascending: true });

    // Get all course assignments for this user
    const { data: allCourseAssignments } = await supabase
      .from('course_assignments')
      .select(`
        course_id,
        status,
        completed_at
      `)
      .eq('user_id', user.id);

    // Find the first authorization with available courses
    for (const assignment of allAssignments || []) {
      // Get courses for this authorization
      const { data: authCourses } = await supabase
        .from('authorisation_courses')
        .select(`
          course_id,
          order_index,
          courses!inner(id, title, status)
        `)
        .eq('authorisation_id', (assignment as any).authorisation_id)
        .eq('courses.status', 'published')
        .order('order_index', { ascending: true });

      for (const authCourse of authCourses || []) {
        // Check if user has an assignment for this course
        const courseAssignment = allCourseAssignments?.find(
          (ca: any) => ca.course_id === (authCourse as any).course_id
        );

        // If no assignment or assignment is not completed, check if it's accessible
        if (!courseAssignment || !courseAssignment.completed_at) {
          // Get the first module to check if it's accessible
          const { data: modules } = await supabase
            .from('course_modules')
            .select('id, type')
            .eq('course_id', (authCourse as any).course_id)
            .order('order_index', { ascending: true })
            .limit(1);

          // Only suggest courses that have digital modules the user can work on
          const firstModule = modules?.[0];
          if (firstModule && 
              firstModule.type !== 'onsite_training' && 
              firstModule.type !== 'onsite_assessment') {
            return NextResponse.json({
              type: 'course',
              id: (authCourse as any).course_id,
              title: (authCourse as any).courses?.title || 'Next Course',
              authorizationId: (assignment as any).authorisation_id,
              authorizationTitle: (assignment as any).authorisations?.title
            });
          }
        }
      }
    }

    // Check for standalone course assignments (not part of authorizations)
    const { data: standaloneCourseAssignments } = await supabase
      .from('course_assignments')
      .select(`
        id,
        course_id,
        status,
        completed_at,
        courses!inner(
          id,
          title,
          status
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'assigned', 'in_progress'])
      .eq('courses.status', 'published')
      .neq('course_id', currentCourseId)
      .order('created_at', { ascending: true });

    // Filter to courses not part of any authorization
    const authCourseIds = new Set<string>();
    const { data: allAuthCourses } = await supabase
      .from('authorisation_courses')
      .select('course_id');
    allAuthCourses?.forEach((ac: any) => authCourseIds.add(ac.course_id));

    for (const courseAssign of standaloneCourseAssignments || []) {
      // Skip if this course is part of an authorization
      if (authCourseIds.has((courseAssign as any).course_id)) continue;
      
      // Skip if already completed
      if ((courseAssign as any).completed_at) continue;

      // Get the first module to check if it's accessible
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id, type')
        .eq('course_id', (courseAssign as any).course_id)
        .order('order_index', { ascending: true })
        .limit(1);

      // Only suggest courses that have digital modules the user can work on
      const firstModule = modules?.[0];
      if (firstModule && 
          firstModule.type !== 'onsite_training' && 
          firstModule.type !== 'onsite_assessment') {
        return NextResponse.json({
          type: 'course',
          id: (courseAssign as any).course_id,
          title: (courseAssign as any).courses?.title || 'Next Course'
        });
      }
    }

    // No incomplete courses found
    return NextResponse.json({ type: 'none' });

  } catch (error) {
    console.error('Error finding next course:', error);
    return NextResponse.json(
      { error: 'Failed to find next course' },
      { status: 500 }
    );
  }
}