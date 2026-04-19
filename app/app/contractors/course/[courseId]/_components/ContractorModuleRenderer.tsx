"use client";

import { useState, useEffect } from "react";
import DOMPurify from "isomorphic-dompurify";
import UnifiedVideoPlayer from "@/components/UnifiedVideoPlayer";
import EquipmentFormBlock from "@/components/EquipmentFormBlock";

interface Module {
  id: string;
  course_id: string;
  type: string;
  title: string;
  order_index: number;
  [key: string]: any;
}

interface ContentBlock {
  id: string;
  module_id: string;
  kind: string;
  data: any;
  order_index: number;
}

interface QuizQuestion {
  id: string;
  quiz_id: string;
  type: string;
  question: string;
  explanation?: string;
  points: number;
  order_index: number;
  options?: QuizOption[];
}

interface QuizOption {
  id: string;
  question_id: string;
  text: string;
  correct: boolean;
  order_index: number;
}

interface QuizSettings {
  id: string;
  module_id: string;
  pass_mark: number;
  max_attempts: number;
  shuffle: boolean;
  show_feedback: boolean;
}

interface ContractorModuleRendererProps {
  module: Module;
  onComplete: () => void;
  isCompleted: boolean;
}

export default function ContractorModuleRenderer({
  module,
  onComplete,
  isCompleted,
}: ContractorModuleRendererProps) {
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [quizData, setQuizData] = useState<{
    settings?: QuizSettings;
    questions: QuizQuestion[];
  }>({ questions: [] });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [quizStarted, setQuizStarted] = useState(false);

  useEffect(() => {
    loadModuleContent();
  }, [module.id]);

  const loadModuleContent = async () => {
    setLoading(true);
    try {
      if (module.type === "digital_training") {
        const response = await fetch(`/api/modules/${module.id}/content`);
        if (response.ok) {
          const data = await response.json();
          setContentBlocks(data.blocks || []);
        }
      } else if (module.type === "digital_assessment_quiz") {
        const response = await fetch(`/api/modules/${module.id}/quiz`);
        if (response.ok) {
          const data = await response.json();
          setQuizData(data);
        }
      }
    } catch (error) {
      console.error("Error loading module content:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderContentBlock = (block: ContentBlock) => {
    const { kind, data } = block;

    switch (kind) {
      case "rich_text":
        return (
          <div
            key={block.id}
            className="prose max-w-none mb-6"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.text || "") }}
          />
        );

      case "link":
        return (
          <div key={block.id} className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">📎 Link Resource</h4>
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {data.title || data.url}
              </a>
              {data.description && (
                <p className="text-sm text-blue-700 mt-1">{data.description}</p>
              )}
            </div>
          </div>
        );

      case "video_embed":
        return (
          <div key={block.id} className="mb-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">🎥 Video Content</h4>
              {data.url ? (
                <UnifiedVideoPlayer
                  videoUrl={data.url}
                  courseId={module.course_id}
                  title={data.title || "Course Video"}
                />
              ) : (
                <p className="text-gray-600">Video URL not available</p>
              )}
              {data.title && <p className="text-sm text-gray-700 mt-2">{data.title}</p>}
            </div>
          </div>
        );

      case "file":
        return (
          <div key={block.id} className="mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">📄 File Resource</h4>
              {data.storage_path ? (
                <a
                  href={`/app/files/${encodeURIComponent(data.storage_path)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-800 underline"
                >
                  📎 {data.title || "Download File"}
                </a>
              ) : (
                <p className="text-green-700">File not available</p>
              )}
            </div>
          </div>
        );

      case "equipment_form":
        return (
          <div key={block.id} className="mb-6">
            <EquipmentFormBlock
              courseId={module.course_id}
              blockData={data}
              preview={false}
            />
          </div>
        );

      default:
        return (
          <div key={block.id} className="mb-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-600">Content type: {kind}</p>
            </div>
          </div>
        );
    }
  };


  const handleAnswer = (answer: any) => {
    const currentQuestion = quizData.questions[currentQuestionIndex];
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer
    }));
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      submitQuiz();
    }
  };

  const submitQuiz = () => {
    let correct = 0;
    quizData.questions.forEach(q => {
      const userAnswer = answers[q.id];
      if (q.type === "mcq" || q.type === "multiple_choice" || q.type === "true_false") {
        const correctOption = q.options?.find(opt => opt.correct);
        if (userAnswer === correctOption?.id) correct++;
      } else if (q.type === "multi") {
        const correctOptions = q.options?.filter(opt => opt.correct).map(opt => opt.id) || [];
        const userAnswers = Array.isArray(userAnswer) ? userAnswer : [];
        if (correctOptions.length === userAnswers.length && 
            correctOptions.every(id => userAnswers.includes(id))) {
          correct++;
        }
      }
    });
    
    const scorePercent = Math.round((correct / quizData.questions.length) * 100);
    setScore(scorePercent);
    setShowResults(true);
  };

  const renderQuizQuestion = (question: QuizQuestion) => {
    const userAnswer = answers[question.id];

    switch (question.type) {
      case "mcq":
      case "multiple_choice":
        return (
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{question.question}</h3>
            <div className="space-y-2">
              {question.options?.map(option => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={userAnswer === option.id}
                    onChange={() => handleAnswer(option.id)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-gray-900">{option.text}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case "multi":
        return (
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{question.question}</h3>
            <div className="space-y-2">
              {question.options?.map(option => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={Array.isArray(userAnswer) ? userAnswer.includes(option.id) : false}
                    onChange={(e) => {
                      const currentAnswers = Array.isArray(userAnswer) ? userAnswer : [];
                      if (e.target.checked) {
                        handleAnswer([...currentAnswers, option.id]);
                      } else {
                        handleAnswer(currentAnswers.filter(id => id !== option.id));
                      }
                    }}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-gray-900">{option.text}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case "true_false":
        return (
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{question.question}</h3>
            <div className="space-y-2">
              {question.options?.map(option => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={userAnswer === option.id}
                    onChange={() => handleAnswer(option.id)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-gray-900">{option.text}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case "short_text":
      case "short_answer":
        return (
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{question.question}</h3>
            <textarea
              value={userAnswer || ""}
              onChange={(e) => handleAnswer(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Enter your answer..."
            />
          </div>
        );

      default:
        return <p>Unsupported question type: {question.type}</p>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Digital Training Module
  if (module.type === "digital_training") {
    return (
      <div className="space-y-6">
        {contentBlocks.length > 0 ? (
          contentBlocks.map(renderContentBlock)
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No training content available.</p>
          </div>
        )}
        
        {!isCompleted && (
          <div className="flex justify-end">
            <button
              onClick={onComplete}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Complete Module
            </button>
          </div>
        )}
      </div>
    );
  }

  // Digital Assessment Quiz Module
  if (module.type === "digital_assessment_quiz") {
    if (!quizStarted) {
      return (
        <div className="text-center py-8">
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-4">Ready to start the quiz?</h3>
            {quizData.settings && (
              <div className="text-sm text-gray-600 mb-6 space-y-1">
                <p>Pass mark: {quizData.settings.pass_mark}%</p>
                <p>Questions: {quizData.questions.length}</p>
                {quizData.settings.max_attempts > 1 && (
                  <p>Max attempts: {quizData.settings.max_attempts}</p>
                )}
              </div>
            )}
            <button
              onClick={() => setQuizStarted(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Start Quiz →
            </button>
          </div>
        </div>
      );
    }

    if (showResults) {
      const passed = quizData.settings ? score >= quizData.settings.pass_mark : score >= 70;
      return (
        <div className="text-center py-8">
          <div className={`max-w-md mx-auto p-6 rounded-lg ${passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h3 className={`text-lg font-medium mb-4 ${passed ? 'text-green-800' : 'text-red-800'}`}>
              Quiz Results
            </h3>
            <div className={`text-2xl font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
              {score}%
            </div>
            <p className={`text-sm mb-6 ${passed ? 'text-green-700' : 'text-red-700'}`}>
              {passed ? '🎉 Congratulations! You passed!' : '❌ You did not meet the pass mark. Please review the material and try again.'}
            </p>
            {passed && !isCompleted && (
              <button
                onClick={onComplete}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Complete Module
              </button>
            )}
          </div>
        </div>
      );
    }

    const currentQuestion = quizData.questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === quizData.questions.length - 1;

    if (!currentQuestion) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">No quiz questions available.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Quiz Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Question {currentQuestionIndex + 1} of {quizData.questions.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / quizData.questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="bg-white p-6 rounded-lg border">
          {renderQuizQuestion(currentQuestion)}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={nextQuestion}
            disabled={!answers[currentQuestion.id]}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLastQuestion ? "Submit Quiz" : "Next Question"}
          </button>
        </div>
      </div>
    );
  }

  // Onsite Training Module
  if (module.type === "onsite_training") {
    return (
      <div className="space-y-6">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-orange-900 mb-4">🏗️ Onsite Training Required</h3>
          <p className="text-orange-700 mb-4">
            This module requires hands-on training at your worksite. Please coordinate with your trainer or supervisor to complete this training.
          </p>
          <div className="text-sm text-orange-600">
            <p>• This training must be completed in person</p>
            <p>• Your trainer will mark this as complete once finished</p>
            <p>• Contact your site supervisor if you need assistance</p>
          </div>
        </div>
        
        {!isCompleted && (
          <div className="text-center">
            <p className="text-gray-600 text-sm">This module will be marked complete by your trainer.</p>
          </div>
        )}
      </div>
    );
  }

  // Onsite Assessment Module
  if (module.type === "onsite_assessment") {
    return (
      <div className="space-y-6">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-purple-900 mb-4">📋 Onsite Assessment Required</h3>
          <p className="text-purple-700 mb-4">
            This module requires a practical assessment to be conducted at your worksite by a qualified assessor.
          </p>
          <div className="text-sm text-purple-600">
            <p>• This assessment must be completed in person</p>
            <p>• Your assessor will evaluate your practical skills</p>
            <p>• Results will be recorded upon completion</p>
          </div>
        </div>
        
        {!isCompleted && (
          <div className="text-center">
            <p className="text-gray-600 text-sm">This module will be marked complete by your assessor.</p>
          </div>
        )}
      </div>
    );
  }

  // Fallback for unknown module types
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">Unknown module type: {module.type}</p>
    </div>
  );
}