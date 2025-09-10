// @ts-nocheck
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { hasRole } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const canAccess = 
      (await hasRole("Course creators")) ||
      (await hasRole("Senior management")) ||
      (await hasRole("Admin"));
    
    if (!canAccess) {
      redirect("/app/home?banner=no_access");
    }

    const formData = await request.formData();
    const originalCourseId = formData.get('courseId') as string;

    if (!originalCourseId) {
      redirect("/app/creator?error=no_course_id");
    }

    const supabase = await createSupabaseServer();

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect("/auth/login");
    }

    // Fetch the original course
    const { data: originalCourse, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', originalCourseId)
      .single();

    if (courseError || !originalCourse) {
      redirect("/app/creator?error=course_not_found");
    }

    // Create the new course with "Copy of" prefix
    const newCourseTitle = `Copy of ${originalCourse.title}`;
    const { data: newCourse, error: newCourseError } = await supabase
      .from('courses')
      .insert({
        title: newCourseTitle,
        description: originalCourse.description,
        department: originalCourse.department,
        valid_for_days: originalCourse.valid_for_days,
        retake_reminder_days: originalCourse.retake_reminder_days,
        tags: originalCourse.tags,
        status: 'draft', // Always create as draft
        created_by: user.id,
        updated_by: user.id
      })
      .select()
      .single();

    if (newCourseError || !newCourse) {
      redirect("/app/creator?error=failed_to_create_course");
    }

    // Fetch all modules from the original course
    const { data: originalModules, error: modulesError } = await supabase
      .from('course_modules')
      .select('*')
      .eq('course_id', originalCourseId)
      .order('order_index');

    if (modulesError) {
      redirect("/app/creator?error=failed_to_fetch_modules");
    }

    // Duplicate each module
    if (originalModules && originalModules.length > 0) {
      for (const originalModule of originalModules) {
        // Create new module
        const { data: newModule, error: newModuleError } = await supabase
          .from('course_modules')
          .insert({
            course_id: newCourse.id,
            type: originalModule.type,
            title: originalModule.title,
            order_index: originalModule.order_index
          })
          .select()
          .single();

        if (newModuleError || !newModule) {
          console.error('Failed to create module:', newModuleError);
          continue;
        }

        // Fetch and duplicate content blocks for this module
        const { data: originalBlocks, error: blocksError } = await supabase
          .from('module_content_blocks')
          .select('*')
          .eq('module_id', originalModule.id)
          .order('order_index');

        if (!blocksError && originalBlocks && originalBlocks.length > 0) {
          const newBlocks = originalBlocks.map(block => ({
            module_id: newModule.id,
            kind: block.kind,
            data: block.data,
            order_index: block.order_index
          }));

          const { error: newBlocksError } = await supabase
            .from('module_content_blocks')
            .insert(newBlocks);

          if (newBlocksError) {
            console.error('Failed to create content blocks:', newBlocksError);
          }
        }

        // If this is a quiz module, duplicate quiz questions
        if (originalModule.type === 'digital_assessment_quiz') {
          const { data: originalQuestions, error: questionsError } = await supabase
            .from('quiz_questions')
            .select('*')
            .eq('module_id', originalModule.id)
            .order('order_index');

          if (!questionsError && originalQuestions && originalQuestions.length > 0) {
            for (const originalQuestion of originalQuestions) {
              // Create new quiz question
              const { data: newQuestion, error: newQuestionError } = await supabase
                .from('quiz_questions')
                .insert({
                  module_id: newModule.id,
                  question_text: originalQuestion.question_text,
                  question_type: originalQuestion.question_type,
                  order_index: originalQuestion.order_index
                })
                .select()
                .single();

              if (newQuestionError || !newQuestion) {
                console.error('Failed to create quiz question:', newQuestionError);
                continue;
              }

              // Duplicate quiz options for this question
              const { data: originalOptions, error: optionsError } = await supabase
                .from('quiz_options')
                .select('*')
                .eq('question_id', originalQuestion.id)
                .order('order_index');

              if (!optionsError && originalOptions && originalOptions.length > 0) {
                const newOptions = originalOptions.map(option => ({
                  question_id: newQuestion.id,
                  option_text: option.option_text,
                  is_correct: option.is_correct,
                  order_index: option.order_index
                }));

                const { error: newOptionsError } = await supabase
                  .from('quiz_options')
                  .insert(newOptions);

                if (newOptionsError) {
                  console.error('Failed to create quiz options:', newOptionsError);
                }
              }
            }
          }
        }
      }
    }

    // Redirect back to creator page with success message
    redirect(`/app/creator?ok=course_duplicated&new_course_id=${newCourse.id}`);
    
  } catch (error) {
    console.error('Error duplicating course:', error);
    redirect("/app/creator?error=duplication_failed");
  }
}