
"use client";

import { useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  options?: { id: string; text: string; correct: boolean }[];
}

interface QuizSettings {
  pass_mark: number;
  max_attempts: number;
  shuffle: boolean;
  show_feedback: boolean;
}

interface QuizQuestionsBlockProps {
  moduleId: string;
  blockId: string;
  questions: QuizQuestion[];
  settings: QuizSettings;
  currentUserId: string;
  preview?: boolean;
}

export default function QuizQuestionsBlock({
  moduleId,
  blockId,
  questions,
  settings,
  currentUserId,
  preview = false
}: QuizQuestionsBlockProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 text-4xl mb-2">❓</div>
        <h3 className="font-medium text-gray-600">No Quiz Questions</h3>
        <p className="text-sm text-gray-500">No questions have been added to this quiz yet.</p>
        {preview && (
          <button 
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white text-sm"
            onClick={() => window.alert("This would start the quiz if questions were available.")}
          >
            Start Quiz →
          </button>
        )}
      </div>
    );
  }

  const shuffledQuestions = settings.shuffle 
    ? [...questions].sort(() => Math.random() - 0.5)
    : questions;

  const currentQuestion = shuffledQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === shuffledQuestions.length - 1;

  const handleAnswer = (answer: any) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer
    }));
  };

  const nextQuestion = () => {
    if (isLastQuestion) {
      submitQuiz();
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const submitQuiz = async () => {
    if (preview) {
      // Mock scoring for preview
      let correct = 0;
      shuffledQuestions.forEach(q => {
        const userAnswer = answers[q.id];
        if (q.type === "multiple_choice" || q.type === "true_false") {
          const correctOption = q.options?.find(opt => opt.correct);
          if (userAnswer === correctOption?.id) correct++;
        }
        // Short answer would need fuzzy matching in real implementation
      });
      
      const scorePercent = Math.round((correct / shuffledQuestions.length) * 100);
      setScore(scorePercent);
      setShowResults(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createSupabaseClient();
      
      // In a real implementation, this would:
      // 1. Score the answers server-side
      // 2. Store the attempt in a quiz_attempts table
      // 3. Update module completion if passed
      
      console.log("Quiz submitted:", { answers, questions: shuffledQuestions });
      
      // Mock response
      await new Promise(resolve => setTimeout(resolve, 1000));
      setScore(75); // Mock score
      setShowResults(true);
      
    } catch (error) {
      console.error("Failed to submit quiz:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showResults) {
    const passed = score >= settings.pass_mark;
    return (
      <div className="text-center py-8">
        <div className={`text-4xl mb-4 ${passed ? "text-green-600" : "text-red-600"}`}>
          {passed ? "🎉" : "😞"}
        </div>
        <h3 className="text-xl font-bold mb-2">
          {passed ? "Congratulations!" : "Better luck next time"}
        </h3>
        <p className="text-lg mb-4">Your score: {score}%</p>
        <p className="text-sm text-gray-600 mb-6">
          {passed 
            ? `You passed! (Required: ${settings.pass_mark}%)`
            : `You need ${settings.pass_mark}% to pass. You can try again.`
          }
        </p>
        {!passed && (
          <button
            onClick={() => {
              setCurrentQuestionIndex(0);
              setAnswers({});
              setShowResults(false);
              setScore(0);
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-white"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Question {currentQuestionIndex + 1} of {shuffledQuestions.length}</span>
        <span>{Math.round(((currentQuestionIndex + 1) / shuffledQuestions.length) * 100)}% complete</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentQuestionIndex + 1) / shuffledQuestions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{currentQuestion.question}</h3>

        {/* Multiple Choice / True False */}
        {(currentQuestion.type === "multiple_choice" || currentQuestion.type === "true_false") && (
          <div className="space-y-2">
            {currentQuestion.options?.map((option) => (
              <label key={option.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value={option.id}
                  checked={answers[currentQuestion.id] === option.id}
                  onChange={(e) => handleAnswer(e.target.value)}
                  className="text-blue-600"
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
        )}

        {/* Short Answer */}
        {currentQuestion.type === "short_answer" && (
          <textarea
            value={answers[currentQuestion.id] || ""}
            onChange={(e) => handleAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full p-3 border rounded-lg"
            rows={3}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
          disabled={currentQuestionIndex === 0}
          className="px-4 py-2 border rounded-md disabled:opacity-50"
        >
          Previous
        </button>
        
        <button
          onClick={nextQuestion}
          disabled={!answers[currentQuestion.id] || isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : isLastQuestion ? "Submit Quiz" : "Next"}
        </button>
      </div>
    </div>
  );
}
