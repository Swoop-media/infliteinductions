// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const sb = supabaseAdmin();
  const { moduleId } = await params;

  try {
    let { data: quiz } = await sb
      .from("quizzes")
      .select("*")
      .eq("module_id", moduleId)
      .single();

    let quizSettings: any;

    if (!quiz) {
      const { data: moduleData } = await sb
        .from("course_modules")
        .select("course_id")
        .eq("id", moduleId)
        .single();

      const courseId = moduleData ? (moduleData as any).course_id : null;

      quizSettings = {
        id: moduleId,
        module_id: moduleId,
        course_id: courseId,
        pass_mark: 70,
        max_attempts: 3,
        shuffle: false,
        show_feedback: true,
      };
    } else {
      quizSettings = quiz;
    }

    let rawQuestions: any[] = [];

    const { data: q1 } = await sb
      .from("quiz_questions")
      .select("*, options:quiz_options(*)")
      .eq("quiz_id", quizSettings.id)
      .order("order_index", { ascending: true });

    if (q1 && q1.length > 0) {
      rawQuestions = q1;
    }

    if (rawQuestions.length === 0) {
      const { data: q2 } = await sb
        .from("quiz_questions")
        .select("*, options:quiz_options(*)")
        .eq("module_id", moduleId)
        .order("order_index", { ascending: true });

      if (q2 && q2.length > 0) {
        rawQuestions = q2;
      }
    }

    if (rawQuestions.length === 0 && quizSettings.course_id) {
      const { data: q3 } = await sb
        .from("quiz_questions")
        .select("*, options:quiz_options(*)")
        .eq("course_id", quizSettings.course_id)
        .order("order_index", { ascending: true });

      if (q3 && q3.length > 0) {
        rawQuestions = q3;
      }
    }

    const questions = rawQuestions.map((q: any) => {
      const questionText = q.question || q.stem || q.prompt || "";
      const questionType = q.type || q.kind || "mcq";

      const rawOptions = q.options || [];
      const options = rawOptions
        .map((opt: any) => ({
          id: opt.id,
          question_id: opt.question_id,
          text: opt.text || opt.label || "",
          correct: opt.correct ?? opt.is_correct ?? false,
          order_index: opt.order_index ?? opt.position ?? 0,
        }))
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

      return {
        id: q.id,
        quiz_id: q.quiz_id,
        module_id: q.module_id,
        type: questionType,
        question: questionText,
        explanation: q.explanation || null,
        points: q.points || 1,
        order_index: q.order_index ?? q.position ?? 0,
        options,
      };
    });

    return NextResponse.json({
      settings: quizSettings,
      questions,
    });
  } catch (error) {
    console.error("Error in quiz API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
