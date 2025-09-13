import { createSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  
  try {
    // First, check if the course exists
    const { data: existingCourse } = await supabase
      .from("courses")
      .select("id")
      .eq("id", "db0b3b5a-1188-429b-8d84-ed28df084bd5")
      .single();
    
    // If course doesn't exist, create it
    if (!existingCourse) {
      const { error: courseError } = await supabase
        .from("courses")
        .insert({
          id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
          title: "TEST CONTRACTORS COURSE Heletranz Site Induction",
          description: "Site induction course for contractors",
          status: "published",
          for_contractors: true
        });
      
      if (courseError) {
        console.error("Error creating course:", courseError);
      }
    }
    
    // Check if module exists
    const { data: existingModule } = await supabase
      .from("modules")
      .select("id")
      .eq("id", "fe57f672-f9b1-4ac0-802a-f4d37d41dd57")
      .single();
    
    // If module doesn't exist, create it
    if (!existingModule) {
      const { error: moduleError } = await supabase
        .from("modules")
        .insert({
          id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
          course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
          type: "digital_assessment_quiz",
          title: "Heletranz Site Induction Quiz",
          description: "Quiz to test knowledge of site safety",
          order_index: 2
        });
      
      if (moduleError) {
        console.error("Error creating module:", moduleError);
      }
    }
    
    // Check if quiz exists
    const { data: existingQuiz } = await supabase
      .from("quizzes")
      .select("id")
      .eq("module_id", "fe57f672-f9b1-4ac0-802a-f4d37d41dd57")
      .single();
    
    let quizId = existingQuiz?.id;
    
    // If quiz doesn't exist, create it
    if (!existingQuiz) {
      const { data: newQuiz, error: quizError } = await supabase
        .from("quizzes")
        .insert({
          module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
          course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
          pass_mark: 70,
          max_attempts: 3
        })
        .select()
        .single();
      
      if (quizError) {
        console.error("Error creating quiz:", quizError);
      } else {
        quizId = newQuiz?.id;
      }
    }
    
    // Delete existing questions if any
    await supabase
      .from("quiz_questions")
      .delete()
      .eq("module_id", "fe57f672-f9b1-4ac0-802a-f4d37d41dd57");
    
    // Insert quiz questions
    const questions = [
      {
        quiz_id: quizId,
        module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
        course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
        type: "mcq",
        question: "What is the primary purpose of a site induction?",
        order_index: 1
      },
      {
        quiz_id: quizId,
        module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
        course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
        type: "true_false",
        question: "Personal Protective Equipment (PPE) is optional on site.",
        order_index: 2
      },
      {
        quiz_id: quizId,
        module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
        course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
        type: "mcq",
        question: "What should you do in case of an emergency?",
        order_index: 3
      },
      {
        quiz_id: quizId,
        module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
        course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
        type: "mcq",
        question: "Which of the following is a hazard you might encounter on site?",
        order_index: 4
      },
      {
        quiz_id: quizId,
        module_id: "fe57f672-f9b1-4ac0-802a-f4d37d41dd57",
        course_id: "db0b3b5a-1188-429b-8d84-ed28df084bd5",
        type: "true_false",
        question: "You should report all incidents, no matter how minor.",
        order_index: 5
      }
    ];
    
    const { data: insertedQuestions, error: questionsError } = await supabase
      .from("quiz_questions")
      .insert(questions)
      .select();
    
    if (questionsError) {
      console.error("Error inserting questions:", questionsError);
      return NextResponse.json({ error: questionsError }, { status: 500 });
    }
    
    // Insert options for each question
    const optionsToInsert = [];
    
    if (insertedQuestions && insertedQuestions.length > 0) {
      // Question 1 options
      const q1 = insertedQuestions[0];
      optionsToInsert.push(
        { question_id: q1.id, text: "To welcome visitors", correct: false, order_index: 1 },
        { question_id: q1.id, text: "To ensure safety and compliance with site requirements", correct: true, order_index: 2 },
        { question_id: q1.id, text: "To provide lunch information", correct: false, order_index: 3 },
        { question_id: q1.id, text: "To assign parking spaces", correct: false, order_index: 4 }
      );
      
      // Question 2 options (true/false)
      const q2 = insertedQuestions[1];
      optionsToInsert.push(
        { question_id: q2.id, text: "True", correct: false, order_index: 1 },
        { question_id: q2.id, text: "False", correct: true, order_index: 2 }
      );
      
      // Question 3 options
      const q3 = insertedQuestions[2];
      optionsToInsert.push(
        { question_id: q3.id, text: "Continue working", correct: false, order_index: 1 },
        { question_id: q3.id, text: "Follow the emergency evacuation procedure", correct: true, order_index: 2 },
        { question_id: q3.id, text: "Call a friend", correct: false, order_index: 3 },
        { question_id: q3.id, text: "Hide under your desk", correct: false, order_index: 4 }
      );
      
      // Question 4 options
      const q4 = insertedQuestions[3];
      optionsToInsert.push(
        { question_id: q4.id, text: "Comfortable seating", correct: false, order_index: 1 },
        { question_id: q4.id, text: "Air conditioning", correct: false, order_index: 2 },
        { question_id: q4.id, text: "Moving vehicles and equipment", correct: true, order_index: 3 },
        { question_id: q4.id, text: "Coffee machines", correct: false, order_index: 4 }
      );
      
      // Question 5 options (true/false)
      const q5 = insertedQuestions[4];
      optionsToInsert.push(
        { question_id: q5.id, text: "True", correct: true, order_index: 1 },
        { question_id: q5.id, text: "False", correct: false, order_index: 2 }
      );
      
      const { error: optionsError } = await supabase
        .from("quiz_options")
        .insert(optionsToInsert);
      
      if (optionsError) {
        console.error("Error inserting options:", optionsError);
        return NextResponse.json({ error: optionsError }, { status: 500 });
      }
    }
    
    return NextResponse.json({
      message: "Quiz data inserted successfully",
      quizId: quizId,
      questionsCount: insertedQuestions?.length || 0,
      optionsCount: optionsToInsert.length
    });
    
  } catch (error) {
    console.error("Error in test-insert-quiz:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}