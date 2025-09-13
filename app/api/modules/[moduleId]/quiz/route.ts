import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const supabase = await createSupabaseServer();
  const { moduleId } = await params;

  try {
    // Get quiz settings
    let { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .select("*")
      .eq("module_id", moduleId)
      .single();

    if (quizError && quizError.code !== "PGRST116") {
      console.error("Error fetching quiz:", quizError);
      return NextResponse.json(
        { error: "Failed to fetch quiz" },
        { status: 500 }
      );
    }

    // If no quiz record exists, create a default settings object
    if (!quiz) {
      // Try to get course_id from the module
      const { data: moduleData } = await supabase
        .from("modules")
        .select("course_id")
        .eq("id", moduleId)
        .single();
      
      quiz = {
        id: moduleId, // Use module_id as fallback quiz id
        module_id: moduleId,
        course_id: moduleData?.course_id,
        pass_mark: 70,
        max_attempts: 3,
        shuffle: false,
        show_feedback: true
      };
    }

    // Get quiz questions with options - try quiz_id first
    let { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select(`
        *,
        options:quiz_options(*)
      `)
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true });

    if (questionsError) {
      console.error("Error fetching questions by quiz_id:", questionsError);
    }

    // Fallback: If no questions found via quiz_id, try direct module_id
    if (!questions || questions.length === 0) {
      console.log("No questions found via quiz_id, trying module_id fallback");
      console.log("Looking for questions with module_id:", moduleId);
      
      // First test without the join to see if questions exist
      const { data: testQuestions, error: testError } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("module_id", moduleId);
      
      console.log("Test query (no join) found:", testQuestions?.length || 0, "questions");
      
      const { data: moduleQuestions, error: moduleQuestionsError } = await supabase
        .from("quiz_questions")
        .select(`
          *,
          options:quiz_options(*)
        `)
        .eq("module_id", moduleId)
        .order("order_index", { ascending: true });

      if (moduleQuestionsError) {
        console.error("Error fetching questions by module_id:", moduleQuestionsError);
      } else {
        console.log(`Module questions result (with join):`, moduleQuestions?.length || 0, "questions found");
        if (moduleQuestions && moduleQuestions.length > 0) {
          console.log(`Found ${moduleQuestions.length} questions via module_id fallback`);
          questions = moduleQuestions;
        }
      }
    }

    // Additional fallback: Try fetching by course_id from the quiz's course
    if ((!questions || questions.length === 0) && quiz.course_id) {
      console.log("No questions found via module_id, trying course_id fallback");
      const { data: courseQuestions, error: courseQuestionsError } = await supabase
        .from("quiz_questions")
        .select(`
          *,
          options:quiz_options(*)
        `)
        .eq("course_id", quiz.course_id)
        .order("order_index", { ascending: true });

      if (courseQuestionsError) {
        console.error("Error fetching questions by course_id:", courseQuestionsError);
      } else if (courseQuestions && courseQuestions.length > 0) {
        console.log(`Found ${courseQuestions.length} questions via course_id fallback`);
        questions = courseQuestions;
      }
    }

    if (!questions) {
      questions = [];
    }

    // Temporary fix: If no questions found, provide sample structure
    if (!questions || questions.length === 0) {
      console.log("No questions found, providing temporary sample questions");
      questions = [
        {
          id: "sample-1",
          quiz_id: quiz.id,
          module_id: moduleId,
          type: "mcq",
          question: "Sample Question 1: This is a placeholder question",
          order_index: 1,
          points: 1,
          options: [
            { id: "opt1-1", question_id: "sample-1", text: "Option A", correct: true, order_index: 1 },
            { id: "opt1-2", question_id: "sample-1", text: "Option B", correct: false, order_index: 2 },
            { id: "opt1-3", question_id: "sample-1", text: "Option C", correct: false, order_index: 3 },
            { id: "opt1-4", question_id: "sample-1", text: "Option D", correct: false, order_index: 4 }
          ]
        },
        {
          id: "sample-2",
          quiz_id: quiz.id,
          module_id: moduleId,
          type: "true_false",
          question: "Sample Question 2: This is a true/false placeholder",
          order_index: 2,
          points: 1,
          options: [
            { id: "opt2-1", question_id: "sample-2", text: "True", correct: false, order_index: 1 },
            { id: "opt2-2", question_id: "sample-2", text: "False", correct: true, order_index: 2 }
          ]
        }
      ];
    }

    // Sort options by order_index
    const questionsWithSortedOptions = (questions || []).map(question => ({
      ...question,
      options: (question.options || []).sort((a: any, b: any) => 
        (a.order_index || 0) - (b.order_index || 0)
      )
    }));

    return NextResponse.json({
      settings: quiz,
      questions: questionsWithSortedOptions
    });
  } catch (error) {
    console.error("Error in quiz API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}