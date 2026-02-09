"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface ContractorCourseProps {
  siteId: string;
  siteName: string;
  contractorName: string;
  contractorCompany: string;
  workingAirside: boolean;
  responsibleUserId?: string | null;
  onBack: () => void;
  onComplete: () => void;
}

interface ContentBlock {
  id: string;
  kind: string;
  data: any;
  order_index: number;
}

interface QuizOption {
  id: string;
  question_id: string;
  text: string;
  correct: boolean;
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

interface QuizSettings {
  id: string;
  module_id: string;
  pass_mark: number;
  max_attempts: number;
  shuffle: boolean;
  show_feedback: boolean;
}

interface CourseModule {
  id: string;
  title: string;
  type: string;
  order_index: number;
  content_blocks?: ContentBlock[];
}

function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
}

function toEmbedUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        if (v) return `https://www.youtube.com/embed/${v}`;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  const { kind, data } = block;

  if (kind === "rich_text") {
    const text = String(data?.text ?? "");
    return (
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }

  if (kind === "video_embed") {
    const url = String(data?.url ?? "");
    if (!url) return null;
    const embedUrl = toEmbedUrl(url);
    return (
      <div className="aspect-video w-full max-w-2xl">
        <iframe
          src={embedUrl}
          className="h-full w-full rounded-md border"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    );
  }

  if (kind === "file") {
    const path = String(data?.path ?? data?.file_path ?? "");
    if (!path) return null;
    const href = fileProxy(path);
    const display = data?.displayName || data?.display_name || path.split("/").pop() || "Download";
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const isImage = isImagePath(path);
    const isPDF = ext === "pdf";

    if (isImage) {
      return (
        <figure className="space-y-1">
          <img
            src={href}
            alt={display}
            className="max-h-[400px] w-auto rounded-md border object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {display}
          </figcaption>
        </figure>
      );
    }

    if (isPDF) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-md border">
            <span className="text-sm font-medium text-gray-900">{display}</span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Open in new tab
            </a>
          </div>
          <div className="border rounded-b-md bg-white">
            <iframe
              src={`${href}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-[500px] rounded-b-md"
              title={display}
            />
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm">
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  if (kind === "link") {
    const url = String(data?.url ?? "");
    const label = String(data?.label ?? data?.text ?? url);
    if (!url) return null;
    return (
      <p className="text-sm">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
          {label}
        </a>
      </p>
    );
  }

  return null;
}

function QuizRenderer({
  moduleId,
  onQuizPassed,
}: {
  moduleId: string;
  onQuizPassed: () => void;
}) {
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
  const [attemptCount, setAttemptCount] = useState(0);

  useEffect(() => {
    const loadQuiz = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/modules/${moduleId}/quiz`);
        if (response.ok) {
          const data = await response.json();
          setQuizData(data);
        }
      } catch (error) {
        console.error("Error loading quiz:", error);
      } finally {
        setLoading(false);
      }
    };
    loadQuiz();
  }, [moduleId]);

  const handleAnswer = (answer: any) => {
    const currentQuestion = quizData.questions[currentQuestionIndex];
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));
  };

  const submitQuiz = () => {
    let correct = 0;
    quizData.questions.forEach((q) => {
      const userAnswer = answers[q.id];
      if (q.type === "mcq" || q.type === "multiple_choice" || q.type === "true_false") {
        const correctOption = q.options?.find((opt) => opt.correct);
        if (userAnswer === correctOption?.id) correct++;
      } else if (q.type === "multi") {
        const correctOptions = q.options?.filter((opt) => opt.correct).map((opt) => opt.id) || [];
        const userAnswers = Array.isArray(userAnswer) ? userAnswer : [];
        if (
          correctOptions.length === userAnswers.length &&
          correctOptions.every((id) => userAnswers.includes(id))
        ) {
          correct++;
        }
      }
    });
    const scorePercent = Math.round((correct / quizData.questions.length) * 100);
    setScore(scorePercent);
    setShowResults(true);
    setAttemptCount((prev) => prev + 1);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      submitQuiz();
    }
  };

  const retryQuiz = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowResults(false);
    setScore(0);
    setQuizStarted(false);
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
              {question.options?.map((option) => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-50">
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
            <p className="text-sm text-gray-500">Select all that apply</p>
            <div className="space-y-2">
              {question.options?.map((option) => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                  <input
                    type="checkbox"
                    value={option.id}
                    checked={Array.isArray(userAnswer) ? userAnswer.includes(option.id) : false}
                    onChange={(e) => {
                      const currentAnswers = Array.isArray(userAnswer) ? userAnswer : [];
                      if (e.target.checked) {
                        handleAnswer([...currentAnswers, option.id]);
                      } else {
                        handleAnswer(currentAnswers.filter((id: string) => id !== option.id));
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
              {question.options?.map((option) => (
                <label key={option.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-50">
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
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (quizData.questions.length === 0) {
    return <p className="text-gray-500 italic">No quiz questions available.</p>;
  }

  if (!quizStarted) {
    return (
      <div className="text-center py-6">
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
          <Button onClick={() => setQuizStarted(true)}>
            Start Quiz
          </Button>
        </div>
      </div>
    );
  }

  if (showResults) {
    const passed = quizData.settings ? score >= quizData.settings.pass_mark : score >= 70;
    const maxAttempts = quizData.settings?.max_attempts || 3;
    const canRetry = !passed && attemptCount < maxAttempts;

    return (
      <div className="text-center py-6">
        <div
          className={`max-w-md mx-auto p-6 rounded-lg ${
            passed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
          }`}
        >
          <h3
            className={`text-lg font-medium mb-4 ${
              passed ? "text-green-800" : "text-red-800"
            }`}
          >
            Quiz Results
          </h3>
          <div
            className={`text-2xl font-bold mb-2 ${
              passed ? "text-green-600" : "text-red-600"
            }`}
          >
            {score}%
          </div>
          <p
            className={`text-sm mb-6 ${
              passed ? "text-green-700" : "text-red-700"
            }`}
          >
            {passed
              ? "Congratulations! You passed!"
              : "You did not meet the pass mark. Please review the material and try again."}
          </p>
          {passed && (
            <Button onClick={onQuizPassed}>
              Continue
            </Button>
          )}
          {canRetry && (
            <Button variant="outline" onClick={retryQuiz}>
              Try Again ({attemptCount}/{maxAttempts} attempts used)
            </Button>
          )}
          {!passed && !canRetry && (
            <p className="text-sm text-red-600 mt-2">
              Maximum attempts reached. Please contact your supervisor.
            </p>
          )}
        </div>
      </div>
    );
  }

  const currentQuestion = quizData.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === quizData.questions.length - 1;

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Question {currentQuestionIndex + 1} of {quizData.questions.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / quizData.questions.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        {renderQuizQuestion(currentQuestion)}
      </div>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentQuestionIndex === 0}
        >
          Previous
        </Button>
        <Button
          onClick={nextQuestion}
          disabled={!answers[currentQuestion.id]}
        >
          {isLastQuestion ? "Submit Quiz" : "Next Question"}
        </Button>
      </div>
    </div>
  );
}

export default function ContractorCourse({ 
  siteId, 
  siteName, 
  contractorName, 
  contractorCompany,
  workingAirside,
  responsibleUserId,
  onBack, 
  onComplete 
}: ContractorCourseProps) {
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizPassed, setQuizPassed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchContractorCourse = async () => {
      try {
        const flowType = workingAirside ? "airside_induction" : "site_induction";
        
        const { data: courseData, error: courseError } = await supabaseBrowser
          .from("courses" as any)
          .select("*, course_modules(*)")
          .eq("contractor_flow_type", flowType)
          .eq("contractor_site_id", siteId)
          .limit(1)
          .single();

        if (courseError && courseError.code !== "PGRST116") {
          console.error("Error fetching contractor course:", courseError);
        }

        if (courseData) {
          setCourse(courseData);
          const courseDataTyped = courseData as any;
          const sortedModules = (courseDataTyped.course_modules || []).sort(
            (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
          );

          const modulesWithContent: CourseModule[] = await Promise.all(
            sortedModules.map(async (mod: any) => {
              if (mod.type === "digital_assessment_quiz") {
                return {
                  ...mod,
                  content_blocks: [],
                };
              }
              const { data: blocks } = await supabaseBrowser
                .from("module_content_blocks" as any)
                .select("*")
                .eq("module_id", mod.id)
                .order("order_index", { ascending: true });
              return {
                ...mod,
                content_blocks: blocks || [],
              };
            })
          );

          setModules(modulesWithContent);
        }
      } catch (err) {
        console.error("Error in fetchContractorCourse:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchContractorCourse();
  }, [siteId, workingAirside]);

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contractor-signin/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractor_name: contractorName,
          contractor_company: contractorCompany || null,
          site_id: siteId,
          course_id: course?.id || null,
          course_completed: true,
          working_airside: workingAirside,
          responsible_user_id: responsibleUserId || null,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Sign-in failed");
      }

      onComplete();
    } catch (err: any) {
      console.error("Error completing contractor course:", err);
      setError(err.message || "Failed to complete. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">
              No induction course found for this site. You can proceed to sign in.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? "Signing In..." : "Sign In"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentModule = modules[currentModuleIndex];
  const isLastModule = currentModuleIndex === modules.length - 1;
  const isQuizModule = currentModule?.type === "digital_assessment_quiz";
  const currentQuizPassed = isQuizModule && quizPassed[currentModule.id];

  const canProceed = !isQuizModule || currentQuizPassed;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{course.title}</CardTitle>
          {course.description && (
            <p className="text-gray-600 text-sm">{course.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <span>Site: {siteName}</span>
            <span>-</span>
            <span>Module {currentModuleIndex + 1} of {modules.length}</span>
          </div>

          {currentModule && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">{currentModule.title}</h3>
              
              {isQuizModule ? (
                <QuizRenderer
                  moduleId={currentModule.id}
                  onQuizPassed={() => {
                    setQuizPassed((prev) => ({ ...prev, [currentModule.id]: true }));
                  }}
                />
              ) : currentModule.content_blocks && currentModule.content_blocks.length > 0 ? (
                <div className="space-y-4">
                  {currentModule.content_blocks.map((block) => (
                    <BlockRenderer key={block.id} block={block} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No content in this module.</p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentModuleIndex > 0) {
                  setCurrentModuleIndex(currentModuleIndex - 1);
                } else {
                  onBack();
                }
              }}
            >
              {currentModuleIndex > 0 ? "Previous" : "Back"}
            </Button>

            {isLastModule ? (
              <Button onClick={handleComplete} disabled={isSubmitting || !canProceed}>
                {isSubmitting ? "Completing..." : "Complete & Sign In"}
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentModuleIndex(currentModuleIndex + 1)}
                disabled={!canProceed}
              >
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
