import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPinnedCourseContext } from '@/lib/course-version';
import { getCurrentCourseVersion } from '@/lib/training-history';

/**
 * Resolves a course's title and first-module type from an immutable snapshot.
 * If the user already has a trainee assignment for the course, its pinned
 * version snapshot is used. Otherwise the current published course version
 * snapshot is resolved. Never reads mutable module tables.
 *
 * Returns null when no snapshot can be resolved (fail closed — do not suggest).
 */
async function resolvePinnedCourseInfo(
  adminClient: any,
  userId: string,
  courseId: string
): Promise<{ title: string; firstModuleType: string | null } | null> {
  try {
    const context = await getPinnedCourseContext(adminClient, {
      userId,
      courseId,
    });
    const modules = Array.isArray(context.modules) ? context.modules : [];
    const firstModule = modules[0] as any;
    return {
      title: context.course?.title || 'Next Course',
      firstModuleType: firstModule?.type ?? null,
    };
  } catch {
    // No pinned trainee assignment yet — resolve the current published version.
  }

  try {
    const version = await getCurrentCourseVersion(adminClient, courseId);
    const snapshot = version?.snapshot;
    if (!snapshot || !snapshot.course || !Array.isArray(snapshot.modules)) {
      return null;
    }
    const firstModule = snapshot.modules[0] as any;
    return {
      title: snapshot.course?.title || version?.title || 'Next Course',
      firstModuleType: firstModule?.type ?? null,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ type: 'none' }, { status: 401 });
    }

    const adminClient = supabaseAdmin();

    const { currentCourseId, currentAuthorizationId } = await request.json() as {
      currentCourseId: string;
      currentAuthorizationId?: string;
    };

    console.log('Finding next course for:', { currentCourseId, currentAuthorizationId });

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
        console.log('Authorization courses found:', authCourses.length);
        console.log('Auth courses:', authCourses.map((ac: any) => ({ id: ac.course_id, title: ac.courses?.title })));
        
        // Find the current course index
        const currentCourseIndex = authCourses.findIndex(
          (ac: any) => ac.course_id === currentCourseId
        );
        console.log('Current course index:', currentCourseIndex);

        // If we found the current course and there's a next one, return it
        if (currentCourseIndex !== -1 && currentCourseIndex + 1 < authCourses.length) {
          const nextCourse = authCourses[currentCourseIndex + 1] as any;
          const pinnedInfo = await resolvePinnedCourseInfo(
            adminClient,
            user.id,
            nextCourse.course_id
          );
          console.log('Next course found:', pinnedInfo?.title);
          return NextResponse.json({
            type: 'course',
            id: nextCourse.course_id,
            title: pinnedInfo?.title || 'Next Course'
          });
        }

        // If we're at the last course, try to find an incomplete course in this authorization
        const { data: courseAssignments } = await supabase
          .from('course_assignments')
          .select(`
            course_id,
            status,
            completed_at
          `)
          .eq('user_id', user.id);

        for (const authCourse of authCourses as any[]) {
          if (authCourse.course_id === currentCourseId) continue;

          const courseAssignment = courseAssignments?.find(
            (ca: any) => ca.course_id === authCourse.course_id
          ) as any;

          // If no assignment or assignment is not completed, suggest this course
          if (!courseAssignment || !courseAssignment?.completed_at) {
            const pinnedInfo = await resolvePinnedCourseInfo(
              adminClient,
              user.id,
              authCourse.course_id
            );
            return NextResponse.json({
              type: 'course',
              id: authCourse.course_id,
              title: pinnedInfo?.title || 'Next Course'
            });
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
        ) as any;

        // If no assignment or assignment is not completed, check if it's accessible
        if (!courseAssignment || !courseAssignment?.completed_at) {
          // Resolve the first module/type decision from the pinned snapshot
          // (existing assignment) or current published version, never mutable
          // module tables.
          const pinnedInfo = await resolvePinnedCourseInfo(
            adminClient,
            user.id,
            (authCourse as any).course_id
          );

          // Only suggest courses that have digital modules the user can work on
          const firstModuleType = pinnedInfo?.firstModuleType;
          if (firstModuleType &&
              firstModuleType !== 'onsite_training' &&
              firstModuleType !== 'onsite_assessment') {
            return NextResponse.json({
              type: 'course',
              id: (authCourse as any).course_id,
              title: pinnedInfo?.title || 'Next Course',
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

      // Resolve the first module/type decision from the pinned snapshot
      // (existing assignment) or current published version, never mutable
      // module tables.
      const pinnedInfo = await resolvePinnedCourseInfo(
        adminClient,
        user.id,
        (courseAssign as any).course_id
      );

      // Only suggest courses that have digital modules the user can work on
      const firstModuleType = pinnedInfo?.firstModuleType;
      if (firstModuleType &&
          firstModuleType !== 'onsite_training' &&
          firstModuleType !== 'onsite_assessment') {
        return NextResponse.json({
          type: 'course',
          id: (courseAssign as any).course_id,
          title: pinnedInfo?.title || 'Next Course'
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