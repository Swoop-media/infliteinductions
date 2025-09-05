// app/app/learn/courses/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import CompleteModuleButton from "./CompleteModuleButton";
import VideoPlayer from "../../../../../components/VideoPlayer";

/**
 * Renders a course as a learner (assignments-only approach).
 * Requires a trainee assignment for the signed-in user.
 */
type RouteParams = { id: string };

type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

type BlockKind = "rich_text" | "link" | "video_embed" | "file" | "request_document";

const TYPE_ORDER: ModuleType[] = [
  "digital_training",
  "digital_assessment_quiz",
  "onsite_training",
  "onsite_assessment",
];

const TYPE_LABEL: Record<ModuleType, string> = {
  digital_training: "Digital Training",
  digital_assessment_quiz: "Digital Quiz",
  onsite_training: "Onsite Training",
  onsite_assessment: "Onsite Assessment",
};

function typeIcon(t: ModuleType) {
  switch (t) {
    case "digital_training": return "📖";
    case "digital_assessment_quiz": return "📝";
    case "onsite_training": return "👥";
    case "onsite_assessment": return "✅";
    default: return "•";
  }
}

// Normalize common share/watch links to proper embed URLs
function toEmbedUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    // YouTube
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
    // Vimeo
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function BlockView({ block }: { block: any }) {
  "use server";
  const kind = block.kind as BlockKind;
  const data = (block.data || {}) as any;

  if (kind === "rich_text") {
    const text = String(data.text ?? "");
    return (
      <div
        className="prose max-w-none whitespace-pre-wrap text-sm"
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    );
  }

  if (kind === "link") {
    const url = String(data.url ?? "");
    const label = String((data.label ?? url) || "Link");
    return (
      <p className="text-sm">
        🔗{" "}
        <a href={url} target="_blank" className="underline break-all">
          {label}
        </a>
      </p>
    );
  }

  if (kind === "video_embed") {
    const raw = String(data.url ?? "");
    const url = toEmbedUrl(raw);
    return url ? (
      <div className="aspect-video w-full overflow-hidden rounded-md border">
        <iframe
          src={url}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <p className="text-sm text-gray-500">No video URL provided.</p>
    );
  }

  if (kind === "file") {
    const display = String(data.filename ?? data.display ?? "Download");
    const path: string | null = data.file_id ?? data.storage_path ?? null;

    if (!path) {
      return <p className="text-sm text-gray-500">File not available.</p>;
    }

    const href = fileProxy(path);

    if (isImagePath(path)) {
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={display}
            className="max-h-[480px] w-auto rounded-md border object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {display} •{" "}
            <a href={href} target="_blank" className="underline">
              open in new tab
            </a>
          </figcaption>
        </figure>
      );
    }

    return (
      <p className="text-sm">
        ⬇️{" "}
        <a href={href} target="_blank" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  if (kind === "request_document") {
    const prompt = String(data.label ?? "Please upload the requested document in the course view.");
    return <p className="text-sm text-gray-700">{prompt}</p>;
  }

  return null;
}

// Server action to submit quiz answers
async function submitQuizAnswers(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = formData.get("moduleId") as string;
  const assignmentId = formData.get("assignmentId") as string;
  const quizId = formData.get("quizId") as string;
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Collect answers from form data
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("question-")) {
      const questionId = key.replace("question-", "");
      answers[questionId] = value as string;
    }
  }

  // Get quiz questions and options to calculate score
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select(`
      id,
      points,
      quiz_options (
        id,
        is_correct
      )
    `)
    .eq("quiz_id", quizId);

  if (!questions) return;

  // Calculate score
  let totalPoints = 0;
  let earnedPoints = 0;

  questions.forEach((question: any) => {
    totalPoints += question.points || 1;
    const selectedOptionId = answers[question.id];
    const selectedOption = question.quiz_options.find((opt: any) => opt.id === selectedOptionId);
    if (selectedOption?.is_correct) {
      earnedPoints += question.points || 1;
    }
  });

  const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  
  // Get quiz pass mark
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("pass_mark")
    .eq("id", quizId)
    .single();

  const passMarkPercent = quiz?.pass_mark || 70;
  const passed = scorePercent >= passMarkPercent;

  // Save quiz attempt
  await supabase.from("quiz_attempts").insert({
    quiz_id: quizId,
    user_id: user.id,
    score_pct: scorePercent,
    passed: passed,
    answers: answers,
  });

  // Mark module as complete if passed
  if (passed) {
    await supabase.from("assignment_progress").upsert([
      {
        assignment_id: assignmentId,
        module_id: moduleId,
        completed_at: new Date().toISOString(),
      },
    ]);
  }

  // Redirect to the next module or course
  const modules = await supabase.from("course_modules").select("id, course_id, order_index, type").eq("id", moduleId).single();
  const sortedModules = await supabase.from("course_modules").select("id, course_id, order_index, type").eq("course_id", modules.data.course_id).order("order_index", { ascending: true });
  const currentModuleIndex = sortedModules.data.findIndex((m: any) => m.id === moduleId);
  const nextModule = sortedModules.data[currentModuleIndex + 1];

  if (nextModule) {
    redirect(`/app/learn/courses/${modules.data.course_id}?module=${nextModule.id}`);
  } else {
    // If no next module, redirect to course completion or next authorization course
    const assignment = await supabase.from("course_assignments").select("course_id, id").eq("id", assignmentId).single();
    const authorizationCourses = await supabase.from("authorisation_courses").select("order_index, course_id").eq("course_id", assignment.data.course_id).order("order_index", { ascending: true });
    const currentAuthCourseIndex = authorizationCourses.data.findIndex((ac: any) => ac.course_id === assignment.data.course_id);
    const nextAuthCourse = authorizationCourses.data[currentAuthCourseIndex + 1];

    if (nextAuthCourse) {
      redirect(`/app/learn/courses/${nextAuthCourse.course_id}?auth=${authorizationCourses.data.find((ac: any) => ac.course_id === nextAuthCourse.course_id)?.authorisation_id}`);
    } else {
      redirect(`/app/learn/courses/${modules.data.course_id}?completed=true`);
    }
  }
}

// Component to render quiz questions
async function QuizRenderer({ moduleId, assignmentId, preview, authorizationId }: { moduleId: string; assignmentId: string; preview?: boolean; authorizationId?: string }) {
  "use server";
  const supabase = await createSupabaseServer();

  // Get module data first
  const { data: moduleData } = await supabase
    .from("course_modules")
    .select("course_id, type")
    .eq("id", moduleId)
    .single();

  if (!moduleData || moduleData.type !== "digital_assessment_quiz") {
    return (
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quiz</h2>
        <div className="text-center py-8">
          <div className="text-red-400 text-4xl mb-2">⚠️</div>
          <h3 className="font-medium text-red-600">Invalid Module Type</h3>
          <p className="text-sm text-red-500">This module is not configured as a quiz module.</p>
        </div>
      </div>
    );
  }

  // First, try to get quiz by module_id
  let { data: quizData, error: quizErr } = await supabase
    .from("quizzes")
    .select("id, pass_mark, max_attempts, shuffle")
    .eq("module_id", moduleId)
    .maybeSingle();

  // If no quiz found by module_id, try by course_id (fallback for legacy quizzes)
  if (quizErr || !quizData) {
    console.log("No quiz found by module_id, trying course_id fallback...");
    
    const { data: legacyQuiz, error: legacyErr } = await supabase
      .from("quizzes")
      .select("id, pass_mark, max_attempts, shuffle")
      .eq("course_id", moduleData.course_id)
      .maybeSingle();

    if (!legacyErr && legacyQuiz) {
      quizData = legacyQuiz;
      quizErr = null;
      console.log("Found legacy quiz by course_id");
    }
  }

  // If still no quiz found, try to create one using RPC function
  if (!quizData) {
    console.log("No quiz found, attempting to create one...");
    
    try {
      const { data: newQuiz, error: rpcErr } = await supabase
        .rpc("ensure_quiz_for_module", { p_module_id: moduleId });

      if (!rpcErr && newQuiz) {
        quizData = newQuiz;
        console.log("Created new quiz:", newQuiz);
      } else {
        console.error("RPC error:", rpcErr);
      }
    } catch (error) {
      console.error("Failed to create quiz:", error);
    }
  }

  if (quizErr) {
    console.error("Quiz fetch error", quizErr);
    return <p className="text-sm text-red-500">Failed to load quiz: {quizErr.message}</p>;
  }

  if (!quizData) {
    return (
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quiz</h2>
        <div className="text-center py-8">
          <div className="text-gray-400 text-4xl mb-2">❓</div>
          <h3 className="font-medium text-gray-600">No Quiz Available</h3>
          <p className="text-sm text-gray-500">No quiz has been configured for this module yet.</p>
          <p className="text-sm text-gray-400 mt-2">Module ID: {moduleId}</p>
          <p className="text-sm text-gray-400">Course ID: {moduleData.course_id}</p>
        </div>
      </div>
    );
  }

  console.log("Quiz found, fetching questions for quiz ID:", quizData.id);

  // Fetch quiz questions
  let { data: questions, error: questionsErr } = await supabase
    .from("quiz_questions")
    .select(`
      id,
      stem,
      question,
      text,
      body,
      type,
      points,
      order_index,
      quiz_options (
        id,
        label,
        is_correct
      )
    `)
    .eq("quiz_id", quizData.id)
    .order("order_index", { ascending: true });

  console.log("Questions fetch result:", { questions, questionsErr });

  if (questionsErr || !questions || questions.length === 0) {
    console.log("No questions found by quiz_id, trying module_id fallback...");
    
    // Try fallback by module_id
    const { data: fallbackQuestions, error: fallbackErr } = await supabase
      .from("quiz_questions")
      .select(`
        id,
        stem,
        question,
        text,
        body,
        type,
        points,
        order_index,
        quiz_options (
          id,
          label,
          is_correct
        )
      `)
      .eq("module_id", moduleId)
      .order("order_index", { ascending: true });

    console.log("Fallback questions fetch result:", { fallbackQuestions, fallbackErr });

    if (fallbackErr || !fallbackQuestions || fallbackQuestions.length === 0) {
      console.error("No questions found anywhere", { questionsErr, fallbackErr, quizId: quizData.id, moduleId });
      return (
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quiz</h2>
          <div className="text-center py-8">
            <div className="text-yellow-400 text-4xl mb-2">📝</div>
            <h3 className="font-medium text-yellow-600">Quiz Ready, No Questions</h3>
            <p className="text-sm text-gray-500">The quiz exists but no questions have been added yet.</p>
            <p className="text-sm text-gray-400 mt-2">Quiz ID: {quizData.id}</p>
            <p className="text-sm text-gray-400">Module ID: {moduleId}</p>
          </div>
        </div>
      );
    }
    
    questions = fallbackQuestions;
  }

  // Check if quiz is already completed
  const { data: progress } = await supabase.from("assignment_progress").select("module_id").eq("assignment_id", assignmentId).eq("module_id", moduleId).single();
  const isCompleted = !!progress;

  if (isCompleted) {
    // Fetch quiz result if completed
    const { data: result } = await supabase.from("quiz_attempts").select("score_pct, passed").eq("quiz_id", quizData.id).eq("user_id", (await supabase.auth.getUser()).data.user?.id).order("created_at", { ascending: false }).limit(1).single();
    return (
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quiz</h2>
        <div className="p-4 rounded-md border-2 text-center" style={{ borderColor: result?.passed ? '#10B981' : '#EF4444', backgroundColor: result?.passed ? '#ECFDF5' : '#FEF2F2' }}>
          <h3 className={`text-lg font-bold ${result?.passed ? 'text-green-600' : 'text-red-600'}`}>
            {result?.passed ? 'Congratulations! You Passed!' : 'Try Again'}
          </h3>
          <p className={`text-sm font-medium ${result?.passed ? 'text-green-700' : 'text-red-700'}`}>
            Your Score: {result?.score_pct ?? 0}%
          </p>
        </div>
      </div>
    );
  }

  // Render quiz questions if not completed
  return (
    <form action={submitQuizAnswers} className="bg-white p-6 rounded-lg border">
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="quizId" value={quizData.id} />
      <input type="hidden" name="answers" value={JSON.stringify([])} /> {/* Placeholder for answers */}

      <h2 className="text-xl font-semibold text-gray-900 mb-4">Quiz</h2>
      <p className="text-sm text-gray-600 mb-6">Answer all questions to complete the quiz.</p>

      {questions.map((q: any, index: number) => {
        // Get question text from available fields
        const questionText = q.stem || q.question || q.text || q.body || 'Question text missing';
        
        return (
          <div key={q.id} className="mb-6 pb-6 border-b last:border-b-0 last:pb-0">
            <p className="text-lg font-medium text-gray-900 mb-3">
              {index + 1}. {questionText}
            </p>
          <div className="space-y-2">
            {q.quiz_options.map((opt: any) => (
              <label key={opt.id} className="flex items-center space-x-3 text-sm text-gray-700">
                <input type="radio" name={`question-${q.id}`} value={opt.id} className="form-radio text-blue-600" />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          </div>
        );
      })}

      <div className="flex justify-end pt-6 border-t">
        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Submit Quiz
        </button>
      </div>
    </form>
  );
}

export default async function LearnerCoursePage(props: {
  params: Promise<RouteParams>;
  searchParams?: Promise<{ module?: string; auth?: string; quiz?: string }>;
}) {
  const { id: courseId } = await props.params;
  const searchParams = await props.searchParams;
  const selectedModuleId = searchParams?.module;
  const authorizationId = searchParams?.auth;
  const preview = searchParams?.preview === '1'; // Extract preview flag
  const showQuiz = searchParams?.quiz === 'start'; // Check if quiz should be displayed

  const supabase = await createSupabaseServer();

  // Require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/login");

  // Must have a trainee assignment for this course
  const { data: assignment, error: assignmentErr } = await supabase
    .from("course_assignments")
    .select("id, role, assignment_status")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .eq("role", "trainee")
    .single();

  if (assignmentErr || !assignment) {
    console.error("No trainee assignment", assignmentErr);
    redirect("/app/learn?error=not_assigned");
  }

  // Load course
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, description, status")
    .eq("id", courseId)
    .single();
  if (courseErr || !course) {
    console.error("Course load error", courseErr);
    notFound();
  }

  // Check if this course is part of an authorization
  let authorizationContext = null;
  let nextCourseInAuth = null;

  if (authorizationId) {
    // Load authorization details
    const { data: auth } = await supabase
      .from("authorisations")
      .select("id, title")
      .eq("id", authorizationId)
      .single();

    if (auth) {
      // Load all courses in this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select(`
          course_id,
          order_index,
          courses!inner(id, title)
        `)
        .eq("authorisation_id", authorizationId)
        .order("order_index", { ascending: true });

      if (authCourses) {
        const currentIndex = authCourses.findIndex(ac => ac.course_id === courseId);
        if (currentIndex !== -1 && currentIndex + 1 < authCourses.length) {
          nextCourseInAuth = authCourses[currentIndex + 1];
        }

        authorizationContext = {
          ...auth,
          courses: authCourses,
          currentIndex: currentIndex + 1,
          totalCourses: authCourses.length
        };
      }
    }
  }

  // Load modules
  const { data: modules, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, title, type, order_index, stage")
    .eq("course_id", course.id)
    .order("order_index", { ascending: true });
  if (modErr) {
    console.error("Modules load error", modErr);
    notFound();
  }

  // Split modules by type
  const digitalTrainingModules = (modules ?? []).filter(mod => mod.type === "digital_training");
  const digitalQuizModules = (modules ?? []).filter(mod => mod.type === "digital_assessment_quiz");
  const onsiteTrainingModules = (modules ?? []).filter(mod => mod.type === "onsite_training");
  const onsiteAssessmentModules = (modules ?? []).filter(mod => mod.type === "onsite_assessment");

  // Sort modules by type order then by order_index
  const sortedModules = (modules ?? []).sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type as ModuleType);
    const tb = TYPE_ORDER.indexOf(b.type as ModuleType);
    if (ta !== tb) return ta - tb;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });

  // Load assignment progress
  const { data: assignmentProgress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignment.id);

  const completedModules = new Set((assignmentProgress ?? []).map(p => p.module_id));
  const totalModules = sortedModules.length;
  const completedCount = completedModules.size;
  const progressPercent = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

  // Determine current module
  let currentModule = null;
  if (selectedModuleId) {
    currentModule = sortedModules.find(m => m.id === selectedModuleId);
  }

  // If no selected module or invalid selection, find the first incomplete module
  if (!currentModule) {
    currentModule = sortedModules.find((module, index) => {
      const isCompleted = completedModules.has(module.id);
      const isUnlocked = index === 0 || sortedModules.slice(0, index).every(m => completedModules.has(m.id));
      return !isCompleted && isUnlocked;
    });
  }

  // If all modules are complete, show the last module
  if (!currentModule && sortedModules.length > 0) {
    currentModule = sortedModules[sortedModules.length - 1];
  }

  // Load blocks for current module
  let blocks: any[] = [];
  let blockErr = null;

  if (currentModule && currentModule.type !== 'digital_assessment_quiz') {
    const { data: blocksData, error: blocksError } = await supabase
      .from("module_content_blocks")
      .select("id, module_id, kind, data, order_index")
      .eq("module_id", currentModule.id)
      .order("order_index", { ascending: true });

    blocks = blocksData || [];
    blockErr = blocksError;

    if (blockErr) {
      console.error("Blocks load error for module", currentModule.id, blockErr);
    }
  }

  const currentModuleIndex = currentModule ? sortedModules.findIndex(m => m.id === currentModule!.id) : -1;
  const isCurrentModuleCompleted = currentModule ? completedModules.has(currentModule.id) : false;
  const isCurrentModuleUnlocked = currentModule ? (
    currentModuleIndex === 0 ||
    sortedModules.slice(0, currentModuleIndex).every(m => completedModules.has(m.id))
  ) : false;

  // Helper to check if a module is completed
  const moduleCompleted = (moduleId: string) => completedModules.has(moduleId);

  return (
    <div className="flex h-screen">
      {/* Left Sidebar */}
      <div className="w-80 border-r bg-gray-50 flex flex-col">
        {/* Course Header */}
        <div className="p-4 border-b bg-white">
          {authorizationContext ? (
            <div className="space-y-2">
              <Link href={`/app/learn/authorisations/${authorizationId}`} className="text-sm text-blue-600 hover:underline block">
                ← Back to {authorizationContext.title}
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Authorization Progress:</span>
                <span>Course {authorizationContext.currentIndex} of {authorizationContext.totalCourses}</span>
              </div>
            </div>
          ) : (
            <Link href="/app/learn" className="text-sm text-blue-600 hover:underline mb-2 block">
              ← Back to courses
            </Link>
          )}
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            {course.title}
          </h1>
          <div className="text-sm text-gray-600 mb-3">
            {completedCount} / {totalModules} modules complete
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Module List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {sortedModules.map((module, index) => {
              const isCompleted = completedModules.has(module.id);
              const isUnlocked = index === 0 || sortedModules.slice(0, index).every(m => completedModules.has(m.id));
              const isCurrent = currentModule?.id === module.id;

              return (
                <Link
                  key={module.id}
                  href={isUnlocked ? `/app/learn/courses/${courseId}?module=${module.id}` : '#'}
                  className={`
                    block p-3 rounded-lg border text-sm transition-all
                    ${isCurrent
                      ? 'bg-blue-50 border-blue-200 text-blue-800 ring-2 ring-blue-200'
                      : isCompleted
                        ? 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
                        : isUnlocked
                          ? 'bg-white border-gray-200 hover:bg-gray-50'
                          : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                    }
                  `}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">
                      {isCompleted ? '✅' : isCurrent ? '👁️' : typeIcon(module.type as ModuleType)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {module.title || TYPE_LABEL[module.type as ModuleType]}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {TYPE_LABEL[module.type as ModuleType]}
                      </div>
                      {!isUnlocked && (
                        <div className="text-xs text-gray-400 mt-1">
                          🔒 Complete previous modules to unlock
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {currentModule?.title || TYPE_LABEL[currentModule?.type as ModuleType] || "No Module Selected"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {currentModule ? `Module ${currentModuleIndex + 1} of ${totalModules}` : "Select a module to begin"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{progressPercent}%</div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          </div>
        </div>

        {/* Module Content */}
        <div className="flex-1 overflow-y-auto">
          {searchParams?.error === "completion_failed" && (
            <div className="mx-auto max-w-4xl p-6">
              <div className="mb-4 rounded-md bg-red-50 p-4 border border-red-200">
                <div className="text-sm text-red-800">
                  ⚠️ Failed to mark module as complete. Please try again.
                </div>
              </div>
            </div>
          )}
          {currentModule ? (
            <div className="max-w-4xl mx-auto p-6">
              <div className="bg-white rounded-xl border shadow-sm p-8 space-y-6">

                {/* Module Content */}
                {isCurrentModuleUnlocked ? (
                  <div className="space-y-6">
                    {/* Render Quiz if current module is quiz type and quiz parameter is present */}
                    {currentModule.type === 'digital_assessment_quiz' && showQuiz && (
                      <QuizRenderer
                        moduleId={currentModule.id}
                        assignmentId={assignment.id}
                        preview={preview}
                        authorizationId={authorizationId}
                      />
                    )}

                    {/* Show Start Quiz button only if current module is quiz type and quiz not started */}
                    {currentModule.type === 'digital_assessment_quiz' && !showQuiz && (
                      <div className="bg-white p-6 rounded-lg border">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Digital Assessment Quiz</h2>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">{currentModule.title || "Digital Quiz"}</h3>
                            <p className="text-sm text-gray-600">Complete this quiz to proceed</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCurrentModuleCompleted ? (
                              <span className="text-sm text-green-600">✓ Complete</span>
                            ) : (
                              <Link
                                href={`/app/learn/courses/${courseId}?module=${currentModule.id}&quiz=start${preview ? "&preview=1" : ""}${authorizationId ? `&auth=${authorizationId}` : ""}`}
                                className="rounded-md bg-black px-3 py-1 text-sm text-white"
                              >
                                Start Quiz →
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {!showQuiz && blocks?.length === 0 && currentModule.type !== 'digital_assessment_quiz' ? (
                      <div className="text-center py-8">
                        <div className="text-gray-500 mb-4">
                          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Content Available</h3>
                        <p className="text-gray-600 mb-4">This module doesn't have any content blocks yet.</p>
                        {currentModule?.type === 'digital_training' && (
                          <p className="text-sm text-gray-500">Contact your course creator to add content to this training module.</p>
                        )}
                      </div>
                    ) : (
                      !showQuiz && blocks?.map((block) => (
                        <div key={block.id} className="space-y-4">
                          <BlockView block={block} />
                        </div>
                      ))
                    )}

                    {/* Digital Training Module Content */}
                    {currentModule.type === 'digital_training' && !isCurrentModuleCompleted && !showQuiz && (
                      <div className="bg-white p-6 rounded-lg border">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6 4h6M5 18h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </div>

                          <div className="flex-1">
                            <h2 className="text-xl font-semibold text-gray-900 mb-2">{currentModule.title}</h2>
                            <div className="text-sm text-gray-600 mb-4">Digital Training</div>

                            {currentModule.content && (
                              <div className="prose prose-sm max-w-none mb-6"
                                   dangerouslySetInnerHTML={{ __html: currentModule.content }} />
                            )}

                            {/* Video content will be rendered through content blocks */}

                            {isCurrentModuleCompleted && (
                              <div className="flex items-center gap-2 text-green-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm font-medium">Completed</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Module Actions */}
                    <div className="pt-6 border-t">
                      {currentModule.type === "digital_training" && !isCurrentModuleCompleted && !showQuiz && (
                        <CompleteModuleButton
                          assignmentId={assignment.id}
                          moduleId={currentModule.id}
                          courseId={courseId}
                          nextModuleId={currentModuleIndex + 1 < sortedModules.length ? sortedModules[currentModuleIndex + 1].id : undefined}
                          authorizationId={authorizationId}
                        />
                      )}

                      {(currentModule.type === "onsite_training" || currentModule.type === "onsite_assessment") && (
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Note:</strong> This step will be completed by your {currentModule.type === "onsite_training" ? "trainer" : "assessor"} during an in-person session.
                          </p>
                        </div>
                      )}

                      {/* Next Course in Authorization */}
                      {progressPercent === 100 && nextCourseInAuth && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <h3 className="font-medium text-green-800 mb-2">Course Complete! 🎉</h3>
                          <p className="text-sm text-green-700 mb-3">
                            Ready to continue with the next course in your authorization?
                          </p>
                          <Link
                            href={`/app/learn/courses/${nextCourseInAuth.course_id}?auth=${authorizationId}`}
                            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                          >
                            Next: {nextAuthCourse.courses.title} →
                          </Link>
                        </div>
                      )}

                      {/* Digital Training Complete - Show Next Steps */}
                      {authorizationContext && completedModules.size === sortedModules.filter(m =>
                        m.type === "digital_training" || m.type === "digital_assessment_quiz"
                      ).length && sortedModules.some(m =>
                        m.type === "onsite_training" || m.type === "onsite_assessment"
                      ) && progressPercent < 100 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <h3 className="font-medium text-yellow-800 mb-2">Digital Training Complete!</h3>
                          <p className="text-sm text-yellow-700 mb-3">
                            You can now continue with digital training for other courses in your authorization while waiting for onsite sessions to be scheduled.
                          </p>
                          {nextCourseInAuth && (
                            <Link
                              href={`/app/learn/courses/${nextCourseInAuth.course_id}?auth=${authorizationId}`}
                              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
                            >
                              Continue with: {nextAuthCourse.courses.title} →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🔒</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Module Locked</h3>
                    <p className="text-gray-600">
                      Complete the previous modules to unlock this content.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Welcome to the Course</h3>
                <p className="text-gray-600">
                  Select a module from the sidebar to begin your learning journey.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}