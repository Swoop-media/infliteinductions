import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || '88502751-39fd-43de-8260-d38360498655';
  
  const courseIds = [
    '96191cc2-6519-4665-b1d5-e08707a9139c',
    'bdc908f2-0346-4678-9b96-ba76a6dc591b', 
    '53e06ebc-2e61-4d78-90ac-9451e435155c'
  ];

  const supabase = supabaseAdmin();
  
  try {
    // Check if user exists
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    // Check course assignments for this user
    const { data: assignments, error: assignmentError } = await supabase
      .from('course_assignments')
      .select('*')
      .eq('user_id', userId)
      .in('course_id', courseIds);
    
    // Get all assignment progress for these assignments
    let progressData = null;
    if (assignments && assignments.length > 0) {
      const assignmentIds = (assignments as any[]).map(a => a.id);
      const { data: progress } = await supabase
        .from('assignment_progress')
        .select('*')
        .in('assignment_id', assignmentIds);
      progressData = progress;
    }
    
    // Get modules for these courses
    const { data: modules } = await supabase
      .from('course_modules')
      .select('*')
      .in('course_id', courseIds)
      .order('course_id')
      .order('order_index');
    
    // Check if there are trainers/assessors for these courses
    const { data: trainerAssessors } = await supabase
      .from('course_assignments')
      .select('*')
      .in('course_id', courseIds)
      .in('role', ['onsite_trainer', 'onsite_assessor']);
    
    // Get course details
    const { data: courses } = await supabase
      .from('courses')
      .select('*')
      .in('id', courseIds);
    
    // Build analysis
    const analysis = {
      user_found: !!userProfile,
      user_id: userId,
      user_email: userProfile ? (userProfile as any).email : null,
      
      assignments_found: assignments ? assignments.length : 0,
      assignments: assignments ? (assignments as any[]).map(a => ({
        assignment_id: a.id,
        course_id: a.course_id,
        role: a.role,
        created_at: a.created_at
      })) : [],
      
      progress_entries: progressData ? progressData.length : 0,
      progress: progressData,
      
      courses_found: courses ? courses.length : 0,
      courses: courses ? (courses as any[]).map(c => ({
        id: c.id,
        title: c.title
      })) : [],
      
      modules_found: modules ? modules.length : 0,
      modules_by_course: courseIds.map(courseId => ({
        course_id: courseId,
        course_title: courses ? (courses as any[]).find(c => c.id === courseId)?.title : 'Unknown',
        modules: modules ? (modules as any[]).filter(m => m.course_id === courseId).map(m => ({
          id: m.id,
          title: m.title,
          type: m.type,
          order_index: m.order_index
        })) : []
      })),
      
      trainers_assessors: trainerAssessors ? (trainerAssessors as any[]).map(t => ({
        course_id: t.course_id,
        user_id: t.user_id,
        role: t.role
      })) : []
    };
    
    // Determine issues
    const issues = [];
    
    if (!userProfile) {
      issues.push(`User ${userId} not found in profiles table`);
    }
    
    if (!assignments || assignments.length === 0) {
      issues.push(`User ${userId} has no assignments for the specified courses`);
    }
    
    if (!courses || courses.length === 0) {
      issues.push('None of the specified course IDs exist in the database');
    }
    
    if (!trainerAssessors || trainerAssessors.length === 0) {
      issues.push('No trainers or assessors assigned to these courses - courses won\'t appear on train-assess page');
    }
    
    // Check each course for specific issues
    if (assignments && modules) {
      for (const assignment of (assignments as any[])) {
        const courseModules = (modules as any[]).filter(m => m.course_id === assignment.course_id);
        const courseTitle = (courses as any[])?.find(c => c.id === assignment.course_id)?.title || assignment.course_id;
        
        const digitalModules = courseModules.filter(m => 
          m.type === 'digital_training' || m.type === 'digital_assessment_quiz'
        );
        const onsiteModules = courseModules.filter(m => 
          m.type === 'onsite_training' || m.type === 'onsite_assessment'
        );
        
        const completedModuleIds = progressData ? 
          (progressData as any[]).filter(p => p.assignment_id === assignment.id).map(p => p.module_id) : [];
        
        const digitalComplete = digitalModules.every(m => completedModuleIds.includes(m.id));
        const onsiteIncomplete = onsiteModules.some(m => !completedModuleIds.includes(m.id));
        
        if (!digitalComplete) {
          issues.push(`Course "${courseTitle}": Digital modules not fully complete`);
        }
        
        if (onsiteModules.length === 0) {
          issues.push(`Course "${courseTitle}": No onsite modules - won't appear on train-assess page`);
        }
        
        if (onsiteModules.length > 0 && !onsiteIncomplete) {
          issues.push(`Course "${courseTitle}": All onsite modules already complete - won't appear on train-assess page`);
        }
      }
    }
    
    return NextResponse.json({
      analysis,
      issues,
      raw_data: {
        userProfile,
        assignments,
        progressData,
        courses,
        modules,
        trainerAssessors
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      details: 'Failed to fetch data from Supabase',
      userId,
      courseIds
    }, { status: 500 });
  }
}