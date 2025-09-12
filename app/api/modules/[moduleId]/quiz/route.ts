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
    const { data: quiz, error: quizError } = await supabase
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

    if (!quiz) {
      return NextResponse.json(
        { error: "Quiz not found" },
        { status: 404 }
      );
    }

    // Get quiz questions with options
    const { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select(`
        *,
        options:quiz_options(*)
      `)
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true });

    if (questionsError) {
      console.error("Error fetching questions:", questionsError);
      return NextResponse.json(
        { error: "Failed to fetch questions" },
        { status: 500 }
      );
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