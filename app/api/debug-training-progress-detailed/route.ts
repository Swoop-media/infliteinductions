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
    // Get user assignments
    const { data: assignments } = await supabase
      .from('course_assignments')
      .select('*')
      .eq('user_id', userId)
      .in('course_id', courseIds);
    
    // Get courses
    const { data: courses } = await supabase
      .from('courses')
      .select('*')
      .in('id', courseIds);
    
    // Get all modules for these courses
    const { data: allModules } = await supabase
      .from('course_modules')
      .select('*')
      .in('course_id', courseIds)
      .order('course_id')
      .order('order_index');
    
    // Get all progress for these assignments
    const assignmentIds = (assignments as any[])?.map(a => a.id) || [];
    const { data: allProgress } = await supabase
      .from('assignment_progress')
      .select('*')
      .in('assignment_id', assignmentIds);
    
    // Build detailed analysis for each course
    const courseAnalysis: any[] = [];
    
    for (const courseId of courseIds) {
      const course = (courses as any[])?.find(c => c.id === courseId);
      const assignment = (assignments as any[])?.find(a => a.course_id === courseId);
      const courseModules = (allModules as any[])?.filter(m => m.course_id === courseId) || [];
      const assignmentProgress = assignment ? 
        (allProgress as any[])?.filter(p => p.assignment_id === assignment.id) || [] : [];
      
      // Group modules by type
      const digitalTraining = courseModules.filter(m => m.type === 'digital_training');
      const digitalQuiz = courseModules.filter(m => m.type === 'digital_assessment_quiz');
      const onsiteTraining = courseModules.filter(m => m.type === 'onsite_training');
      const onsiteAssessment = courseModules.filter(m => m.type === 'onsite_assessment');
      
      // Check completion for each type
      const completedModuleIds = assignmentProgress.map(p => p.module_id);
      
      const digitalTrainingComplete = digitalTraining.map(m => ({
        id: m.id,
        title: m.title,
        completed: completedModuleIds.includes(m.id)
      }));
      
      const digitalQuizComplete = digitalQuiz.map(m => ({
        id: m.id,
        title: m.title,
        completed: completedModuleIds.includes(m.id)
      }));
      
      const onsiteTrainingComplete = onsiteTraining.map(m => ({
        id: m.id,
        title: m.title,
        completed: completedModuleIds.includes(m.id)
      }));
      
      const onsiteAssessmentComplete = onsiteAssessment.map(m => ({
        id: m.id,
        title: m.title,
        completed: completedModuleIds.includes(m.id)
      }));
      
      // Determine why course might not show on train-assess page
      const allDigitalComplete = 
        digitalTrainingComplete.every(m => m.completed) && 
        digitalQuizComplete.every(m => m.completed);
      
      const hasOnsiteModules = onsiteTraining.length > 0 || onsiteAssessment.length > 0;
      const onsiteTrainingPending = onsiteTraining.length > 0 && onsiteTrainingComplete.some(m => !m.completed);
      const onsiteAssessmentPending = onsiteAssessment.length > 0 && onsiteAssessmentComplete.some(m => !m.completed);
      
      const shouldShowInTrainAssess = allDigitalComplete && (onsiteTrainingPending || onsiteAssessmentPending);
      
      courseAnalysis.push({
        course_id: courseId,
        course_title: course?.title || 'Unknown',
        assignment_id: assignment?.id,
        assignment_status: assignment?.assignment_status,
        
        module_summary: {
          digital_training: {
            total: digitalTraining.length,
            completed: digitalTrainingComplete.filter(m => m.completed).length,
            modules: digitalTrainingComplete
          },
          digital_quiz: {
            total: digitalQuiz.length,
            completed: digitalQuizComplete.filter(m => m.completed).length,
            modules: digitalQuizComplete
          },
          onsite_training: {
            total: onsiteTraining.length,
            completed: onsiteTrainingComplete.filter(m => m.completed).length,
            modules: onsiteTrainingComplete
          },
          onsite_assessment: {
            total: onsiteAssessment.length,
            completed: onsiteAssessmentComplete.filter(m => m.completed).length,
            modules: onsiteAssessmentComplete
          }
        },
        
        status_checks: {
          all_digital_complete: allDigitalComplete,
          has_onsite_modules: hasOnsiteModules,
          onsite_training_pending: onsiteTrainingPending,
          onsite_assessment_pending: onsiteAssessmentPending,
          should_show_in_train_assess: shouldShowInTrainAssess
        },
        
        reason_not_showing: !shouldShowInTrainAssess ? 
          (!allDigitalComplete ? "Digital modules not complete" :
           !hasOnsiteModules ? "No onsite modules in this course" :
           (!onsiteTrainingPending && !onsiteAssessmentPending) ? "All onsite modules already complete" :
           "Unknown reason") : null
      });
    }
    
    // Check for trainers/assessors
    const { data: trainers } = await supabase
      .from('course_assignments')
      .select('*')
      .in('course_id', courseIds)
      .in('role', ['onsite_trainer', 'onsite_assessor']);
    
    const trainersByCourse = courseIds.map(courseId => ({
      course_id: courseId,
      trainers: (trainers as any[])?.filter(t => t.course_id === courseId && t.role === 'onsite_trainer').length || 0,
      assessors: (trainers as any[])?.filter(t => t.course_id === courseId && t.role === 'onsite_assessor').length || 0
    }));
    
    return NextResponse.json({
      user: {
        id: userId,
        email: (assignments as any[])?.[0]?.email || 'Unknown'
      },
      course_analysis: courseAnalysis,
      trainers_by_course: trainersByCourse,
      summary: {
        courses_that_should_show: courseAnalysis.filter(c => c.status_checks.should_show_in_train_assess).length,
        courses_with_issues: courseAnalysis.filter(c => !c.status_checks.should_show_in_train_assess).length
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      details: 'Failed to analyze training progress'
    }, { status: 500 });
  }
}