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

    // First, check if there are other incomplete courses in the current authorization
    if (currentAuthorizationId) {
      const { data: authCourses } = await supabase
        .from('authorisation_courses')
        .select(`
          course_id,
          order_index,
          courses!inner(id, title, status)
        `)
        .eq('authorisation_id', currentAuthorizationId)
        .order('order_index', { ascending: true });

      if (authCourses && authCourses.length > 0) {
        // Get user's progress on these courses
        const { data: assignments } = await supabase
          .from('authorisation_assignments')
          .select(`
            id,
            assignment_progress!inner(
              module_id,
              completed_at
            )
          `)
          .eq('user_id', user.id)
          .eq('authorisation_id', currentAuthorizationId);

        // Find the next incomplete course in this authorization
        for (const authCourse of authCourses as any[]) {
          if (authCourse.course_id === currentCourseId) continue;

          // Check if this course has incomplete modules
          const { data: modules } = await supabase
            .from('course_modules')
            .select('id')
            .eq('course_id', authCourse.course_id);

          const moduleIds = modules?.map((m: any) => m.id) || [];
          const completedModuleIds = (assignments as any)?.[0]?.assignment_progress
            ?.filter((p: any) => p.completed_at && moduleIds.includes(p.module_id))
            .map((p: any) => p.module_id) || [];

          // If not all modules are complete, this is our next course
          if (moduleIds.length > completedModuleIds.length) {
            return NextResponse.json({
              type: 'course',
              id: authCourse.course_id,
              title: authCourse.courses?.title || 'Next Course'
            });
          }
        }
      }
    }

    // If no incomplete courses in current authorization, check other authorizations
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
        ),
        assignment_progress(
          module_id,
          completed_at
        )
      `)
      .eq('user_id', user.id)
      .in('assignment_status', ['pending', 'in_progress'])
      .neq('authorisation_id', currentAuthorizationId || '')
      .order('created_at', { ascending: true });

    // Find the first authorization with incomplete courses
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
        // Check if this course has incomplete modules
        const { data: modules } = await supabase
          .from('course_modules')
          .select('id')
          .eq('course_id', (authCourse as any).course_id);

        const moduleIds = modules?.map((m: any) => m.id) || [];
        const completedModuleIds = (assignment as any).assignment_progress
          ?.filter((p: any) => p.completed_at && moduleIds.includes(p.module_id))
          .map((p: any) => p.module_id) || [];

        // If not all modules are complete, this is our next course
        if (moduleIds.length > completedModuleIds.length) {
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

    // Check for standalone course assignments (not part of authorizations)
    const { data: courseAssignments } = await supabase
      .from('course_assignments')
      .select(`
        id,
        course_id,
        courses!inner(
          id,
          title,
          status
        ),
        assignment_progress(
          module_id,
          completed_at
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('courses.status', 'published')
      .neq('course_id', currentCourseId)
      .order('created_at', { ascending: true });

    for (const courseAssign of courseAssignments || []) {
      // Check if this course has incomplete modules
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id')
        .eq('course_id', (courseAssign as any).course_id);

      const moduleIds = modules?.map((m: any) => m.id) || [];
      const completedModuleIds = (courseAssign as any).assignment_progress
        ?.filter((p: any) => p.completed_at && moduleIds.includes(p.module_id))
        .map((p: any) => p.module_id) || [];

      // If not all modules are complete, this is our next course
      if (moduleIds.length > completedModuleIds.length) {
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