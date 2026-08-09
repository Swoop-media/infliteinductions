// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, User, BookOpen, ClipboardCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import InteractiveRequirements from "./InteractiveRequirements";
import EquipmentAssessmentView from "@/components/EquipmentAssessmentView";
import CompleteCourseButton from "./CompleteCourseButton";
import CourseDocuments from "./CourseDocuments";
import QuizReviewSection from "./QuizReviewSection";

async function loadQuizReviewData(courseId: string, learnerId: string, reviewerId: string) {
  const supabaseService = supabaseAdmin();

  // Only quizzes explicitly marked reviewable by the creator.
  // Tolerant: if the reviewable_onsite column doesn't exist yet, show nothing.
  let quizzes: any[] = [];
  try {
    const { data, error } = await supabaseService
      .from("quizzes")
      .select("id, module_id, reviewable_onsite")
      .eq("course_id", courseId)
      .eq("reviewable_onsite", true);
    if (error) return [];
    quizzes = data || [];
  } catch {
    return [];
  }
  if (quizzes.length === 0) return [];

  // Module titles for quiz labels
  const quizModuleIds = quizzes.map((q) => q.module_id).filter(Boolean);
  let moduleTitles: Record<string, string> = {};
  if (quizModuleIds.length > 0) {
    const { data: mods } = await supabaseService
      .from("course_modules")
      .select("id, title")
      .in("id", quizModuleIds);
    for (const m of mods || []) moduleTitles[m.id] = m.title;
  }

  const results: any[] = [];
  for (const quiz of quizzes) {
    // Latest attempt by this learner
    const { data: attempts } = await supabaseService
      .from("quiz_attempts")
      .select("id, score_pct, passed, answers, submitted_at, created_at")
      .eq("quiz_id", quiz.id)
      .eq("user_id", learnerId)
      .order("created_at", { ascending: false })
      .limit(1);
    const attempt = attempts?.[0] || null;

    // Questions + options
    const { data: questions } = await supabaseService
      .from("quiz_questions")
      .select("id, prompt, stem, order_index")
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true });

    const questionIds = (questions || []).map((q) => q.id);
    let optionsByQuestion: Record<string, any[]> = {};
    if (questionIds.length > 0) {
      const { data: options } = await supabaseService
        .from("quiz_options")
        .select("id, question_id, label, is_correct, order_index")
        .in("question_id", questionIds)
        .order("order_index", { ascending: true });
      for (const o of options || []) {
        if (!optionsByQuestion[o.question_id]) optionsByQuestion[o.question_id] = [];
        optionsByQuestion[o.question_id].push(o);
      }
    }

    const answersMap: Record<string, string> = (attempt?.answers && typeof attempt.answers === "object") ? attempt.answers : {};

    // Existing review comments (tolerant if table doesn't exist yet)
    let reviews: any[] = [];
    let myComment = "";
    try {
      const { data: reviewRows, error: revErr } = await supabaseService
        .from("quiz_onsite_reviews")
        .select("reviewer_id, comments, updated_at")
        .eq("quiz_id", quiz.id)
        .eq("learner_id", learnerId)
        .order("updated_at", { ascending: false });
      if (!revErr && reviewRows) {
        const reviewerIds = reviewRows.map((r) => r.reviewer_id);
        let names: Record<string, string> = {};
        if (reviewerIds.length > 0) {
          const { data: profiles } = await supabaseService
            .from("profiles")
            .select("id, full_name, email")
            .in("id", reviewerIds);
          for (const p of profiles || []) names[p.id] = p.full_name || p.email || "Reviewer";
        }
        for (const r of reviewRows) {
          if (r.reviewer_id === reviewerId) {
            myComment = r.comments || "";
          } else {
            reviews.push({
              reviewerName: names[r.reviewer_id] || "Reviewer",
              comments: r.comments || "",
              updatedAt: r.updated_at,
            });
          }
        }
      }
    } catch {}

    results.push({
      quizId: quiz.id,
      quizTitle: moduleTitles[quiz.module_id] || "Digital Assessment Quiz",
      attempt: attempt
        ? {
            scorePct: attempt.score_pct ?? null,
            passed: attempt.passed ?? null,
            submittedAt: attempt.submitted_at || attempt.created_at || null,
          }
        : null,
      questions: (questions || []).map((q) => ({
        id: q.id,
        prompt: q.prompt || q.stem || "",
        options: (optionsByQuestion[q.id] || []).map((o) => ({
          id: o.id,
          label: o.label,
          isCorrect: !!o.is_correct,
        })),
        selectedOptionId: answersMap[q.id] || null,
      })),
      reviews,
      myComment,
    });
  }
  return results;
}

async function saveRequirementResponses(moduleId: string, assignmentId: string, responses: Record<string, any>) {
  "use server";
  
  const supabase = await createSupabaseServer();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Authentication required");
  }

  // Use admin client to bypass RLS when trainers save responses for trainees
  const supabaseService = supabaseAdmin();

  // Save or update requirement responses
  const responseEntries = Object.entries(responses).map(([requirementId, value]) => ({
    requirement_id: requirementId,
    module_id: moduleId,
    assignment_id: assignmentId,
    trainer_id: user.id,
    response_value: value,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  // First, delete existing responses for this module/assignment/trainer combination
  await supabaseService
    .from("requirement_responses")
    .delete()
    .eq("module_id", moduleId)
    .eq("assignment_id", assignmentId)
    .eq("trainer_id", user.id);

  // Insert new responses
  if (responseEntries.length > 0) {
    const { error } = await supabaseService
      .from("requirement_responses")
      .insert(responseEntries);
    
    if (error) {
      console.error("Error saving requirement responses:", error);
      throw new Error("Failed to save responses");
    }
  }

}

async function saveQuizReviewComment(courseId: string, learnerId: string, quizId: string, comments: string) {
  "use server";

  const supabase = await createSupabaseServer();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Authentication required");
  }

  // Server-side role check: the caller must be an onsite trainer or assessor
  // for this course. reviewer_id always comes from the session.
  const { data: trainerAssignments } = await supabase
    .from("course_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .in("role", ["onsite_trainer", "onsite_assessor"]);
  if (!trainerAssignments || trainerAssignments.length === 0) {
    throw new Error("Not authorised");
  }

  const supabaseService = supabaseAdmin();

  // Exclude archived learners (matches the rest of the app)
  const { data: learnerProfile } = await supabaseService
    .from("profiles")
    .select("id, archived_at")
    .eq("id", learnerId)
    .maybeSingle();
  if (!learnerProfile || learnerProfile.archived_at) {
    throw new Error("Learner not available for review");
  }

  // Verify the quiz belongs to this course and is marked reviewable.
  // Tolerant: if migration 009 hasn't been applied yet, the column/table
  // won't exist — fail with a clear message instead of a raw DB error.
  const { data: quiz, error: quizError } = await supabaseService
    .from("quizzes")
    .select("id, course_id, reviewable_onsite")
    .eq("id", quizId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (quizError) {
    throw new Error("Quiz review is not available yet");
  }
  if (!quiz || !quiz.reviewable_onsite) {
    throw new Error("Quiz is not reviewable");
  }

  // Latest attempt (optional link)
  const { data: attempts } = await supabaseService
    .from("quiz_attempts")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("user_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(1);

  const { error } = await supabaseService
    .from("quiz_onsite_reviews")
    .upsert({
      quiz_id: quizId,
      learner_id: learnerId,
      reviewer_id: user.id,
      attempt_id: attempts?.[0]?.id || null,
      comments,
      updated_at: new Date().toISOString(),
    }, { onConflict: "quiz_id,learner_id,reviewer_id" });

  if (error) {
    console.error("Error saving quiz review comment:", error);
    throw new Error("Failed to save comment");
  }
}

interface CoursePlayerProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    trainee?: string;
    type?: 'training' | 'assessment';
  }>;
}

export default async function CoursePlayerPage({ params, searchParams }: CoursePlayerProps) {
  const supabase = await createSupabaseServer();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const courseId = resolvedParams.id;
  const assignmentId = resolvedSearchParams.trainee;
  const sessionType = resolvedSearchParams.type || 'training';
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/auth/login");
  }

  if (!assignmentId) {
    redirect("/app/train-assess");
  }

  // FIRST: Verify trainer/assessor has access to this course (can have multiple roles)
  const { data: trainerAssignments, error: trainerError } = await supabase
    .from("course_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .in("role", ["onsite_trainer", "onsite_assessor"]);
  
  if (!trainerAssignments || trainerAssignments.length === 0) {
    redirect("/app/train-assess");
  }
  
  const userRoles = trainerAssignments.map(a => a.role);
  const requiredRole = sessionType === 'training' ? 'onsite_trainer' : 'onsite_assessor';
  const hasRequiredRole = userRoles.includes(requiredRole);
  
  if (!hasRequiredRole) {
    redirect("/app/train-assess");
  }

  // NOW: Get course info
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("title, description")
    .eq("id", courseId)
    .single();

  if (!course) {
    redirect("/app/train-assess");
  }

  // THEN: Get trainee assignment using SERVICE ROLE to bypass RLS
  // Since we already verified the trainer has access to this course
  const supabaseService = supabaseAdmin();
  const { data: assignment, error: assignmentError } = await supabaseService
    .from("course_assignments")
    .select("id, user_id, course_id, assignment_status")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .eq("role", "trainee")
    .maybeSingle();

  if (!assignment) {
    redirect("/app/train-assess");
  }
  
  // Get trainee profile using service role
  const { data: profile } = await supabaseService
    .from("profiles")
    .select("full_name, email, archived_at")
    .eq("id", assignment.user_id)
    .single();


  // Get course modules
  const moduleType = sessionType === 'training' ? 'onsite_training' : 'onsite_assessment';
  const { data: modules } = await supabase
    .from("course_modules")
    .select("*, include_equipment_assessment")
    .eq("course_id", courseId)
    .eq("type", moduleType)
    .order("order_index");

  // Get onsite requirements for each module
  const moduleIds = modules?.map(m => m.id) || [];
  
  let requirementsByModule: Record<string, any[]> = {};
  if (moduleIds.length > 0) {
    // Fetch ALL requirements for the modules regardless of role value
    // This matches how the learner module fetches them
    // Security is handled by the role check above, not by filtering requirements
    const { data: requirements } = await supabase
      .from("onsite_requirements")
      .select("*")
      .in("module_id", moduleIds)
      .order("order_index");
    
    // Group requirements by module
    requirementsByModule = (requirements || []).reduce((acc, req) => {
      if (!acc[req.module_id]) acc[req.module_id] = [];
      acc[req.module_id].push(req);
      return acc;
    }, {} as Record<string, any[]>);
  }

  // Get trainee's progress
  const { data: progress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignmentId);

  const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

  // Quiz review data (only quizzes marked reviewable by the creator).
  // Archived learners are excluded, matching the rest of the app.
  const quizReviewData = profile?.archived_at
    ? []
    : await loadQuizReviewData(courseId, assignment.user_id, user.id);

  const traineeName = profile?.full_name || profile?.email || "Unknown";
  const traineeEmail = profile?.email || "";

  // Calculate progress
  const totalModules = modules?.length || 0;
  const completedModules = modules?.filter(m => completedModuleIds.has(m.id)).length || 0;
  const progressPercentage = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;

  // Check if any pass_fail requirements have "fail" responses
  let hasFailedRequirements = false;
  if (sessionType === 'assessment' && user) {
    const { data: failResponses } = await supabase
      .from("requirement_responses")
      .select("response_value, requirement_id")
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id)
      .eq("response_value", "fail");
    
    if (failResponses && failResponses.length > 0) {
      // Check if these are actually pass_fail type requirements
      const failedReqIds = failResponses.map(r => r.requirement_id);
      const { data: requirements } = await supabase
        .from("onsite_requirements")
        .select("id, field_type")
        .in("id", failedReqIds)
        .eq("field_type", "pass_fail");
      
      hasFailedRequirements = requirements && requirements.length > 0;
    }
  }

  // For assessment sessions, load the notes/responses recorded during onsite
  // training so the assessor can see where the trainee struggled or needed work.
  type TrainingNoteModule = {
    module_id: string;
    module_title: string;
    entries: {
      label: string;
      field_type: string;
      response_text: string;
      trainer_name: string | null;
      response_date: string | null;
    }[];
  };
  let trainingNotes: TrainingNoteModule[] = [];
  if (sessionType === 'assessment') {
    const { data: trainingModules } = await supabase
      .from("course_modules")
      .select("id, title, order_index")
      .eq("course_id", courseId)
      .eq("type", "onsite_training")
      .order("order_index");

    const trainingModuleIds = (trainingModules || []).map(m => m.id);
    if (trainingModuleIds.length > 0) {
      // Responses may have been entered by a different trainer than the current
      // assessor, so fetch them with the service client (scoped to this trainee's
      // assignment + the course's training modules only).
      const [{ data: trainingReqs }, { data: trainingResponses }] = await Promise.all([
        supabase
          .from("onsite_requirements")
          .select("id, module_id, label, field_type, order_index")
          .in("module_id", trainingModuleIds)
          .order("order_index"),
        supabaseService
          .from("requirement_responses")
          .select("requirement_id, module_id, trainer_id, response_value, updated_at, created_at")
          .eq("assignment_id", assignmentId)
          .in("module_id", trainingModuleIds),
      ]);

      const trainerIds = Array.from(new Set((trainingResponses || []).map(r => r.trainer_id).filter(Boolean)));
      const trainerNames = new Map<string, string>();
      if (trainerIds.length > 0) {
        const { data: trainerProfiles } = await supabaseService
          .from("profiles")
          .select("id, full_name, email")
          .in("id", trainerIds);
        for (const p of trainerProfiles || []) {
          trainerNames.set(p.id, p.full_name || p.email || "Unknown trainer");
        }
      }

      const formatResponse = (value: any, fieldType: string): string => {
        if (value === null || value === undefined) return "";
        // Some save paths JSON.stringify non-string values, so booleans/numbers
        // can arrive as the strings "true"/"false"/"3". Normalize by field type.
        if (typeof value === "string") {
          if (fieldType === "checkbox" || value === "true" || value === "false") {
            if (value === "true") return "Yes";
            if (value === "false") return "No";
          }
          if (fieldType === "rating") {
            const n = Number(value);
            if (Number.isFinite(n) && n >= 1 && n <= 5) return `Rating: ${n}/5`;
          }
          return value;
        }
        if (typeof value === "boolean") return value ? "Yes" : "No";
        if (typeof value === "number") {
          if (fieldType === "rating" && value >= 1 && value <= 5) return `Rating: ${value}/5`;
          return String(value);
        }
        if (typeof value === "object") {
          if ("value" in value) return String(value.value);
          if ("text" in value) return String(value.text);
          if ("checked" in value) return value.checked ? "Yes" : "No";
          return JSON.stringify(value);
        }
        return String(value);
      };

      trainingNotes = (trainingModules || []).map(tm => {
        const reqs = (trainingReqs || []).filter(r => r.module_id === tm.id);
        const entries = reqs.flatMap(req => {
          const responses = (trainingResponses || []).filter(r => r.requirement_id === req.id);
          return responses
            .map(resp => ({
              label: req.label || "Requirement",
              field_type: req.field_type || "text",
              response_text: formatResponse(resp.response_value, req.field_type || "text"),
              trainer_name: resp.trainer_id ? trainerNames.get(resp.trainer_id) || null : null,
              response_date: resp.updated_at || resp.created_at || null,
            }))
            .filter(e => e.response_text.trim() !== "");
        });
        return { module_id: tm.id, module_title: tm.title || "Training module", entries };
      }).filter(m => m.entries.length > 0);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/app/train-assess">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Train & Assess
          </Button>
        </Link>
      </div>

      {/* Course and Trainee Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Course Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Course:</span>
              <span className="ml-2">{course.title}</span>
            </div>
            <div>
              <span className="font-medium">Session Type:</span>
              <Badge className="ml-2" variant={sessionType === 'training' ? 'default' : 'secondary'}>
                {sessionType === 'training' ? (
                  <>
                    <BookOpen className="h-3 w-3 mr-1" />
                    Onsite Training
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-3 w-3 mr-1" />
                    Onsite Assessment
                  </>
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Trainee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Name:</span>
              <span className="ml-2">{traineeName}</span>
            </div>
            <div>
              <span className="font-medium">Email:</span>
              <span className="ml-2">{traineeEmail}</span>
            </div>
            <div>
              <span className="font-medium">Progress:</span>
              <div className="mt-2">
                <Progress value={progressPercentage} className="w-full" />
                <p className="text-sm text-muted-foreground mt-1">
                  {completedModules} of {totalModules} modules completed ({Math.round(progressPercentage)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course Documents - Show for both training and assessment sessions */}
      <CourseDocuments 
        courseId={courseId}
        traineeId={assignment.user_id}
      />

      {/* Quiz Review - only quizzes the creator marked as reviewable */}
      <QuizReviewSection
        quizzes={quizReviewData}
        onSaveComment={async (quizId: string, comments: string) => {
          "use server";
          await saveQuizReviewComment(courseId, assignment.user_id, quizId, comments);
        }}
      />

      {/* Training notes recorded during onsite training (assessment sessions only) */}
      {sessionType === 'assessment' && trainingNotes.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Notes from Onsite Training
            </CardTitle>
            <CardDescription>
              What was recorded during this trainee's onsite training — useful to see where they struggled or needed the most work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {trainingNotes.map(tm => (
              <div key={tm.module_id} className="rounded-lg border bg-card p-4">
                <h4 className="font-medium mb-3">{tm.module_title}</h4>
                <div className="space-y-3">
                  {tm.entries.map((entry, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-muted-foreground">{entry.label}</p>
                      <p className="text-sm whitespace-pre-wrap">{entry.response_text}</p>
                      {(entry.trainer_name || entry.response_date) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {entry.trainer_name ? `Recorded by ${entry.trainer_name}` : ''}
                          {entry.trainer_name && entry.response_date ? ' · ' : ''}
                          {entry.response_date ? new Date(entry.response_date).toLocaleString() : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Modules */}
      <Card>
        <CardHeader>
          <CardTitle>
            {sessionType === 'training' ? 'Training Modules' : 'Assessment Modules'}
          </CardTitle>
          <CardDescription>
            {sessionType === 'training' 
              ? 'Complete each training module with the trainee'
              : 'Conduct assessments for each module'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!modules || modules.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No {sessionType} modules found for this course.
            </p>
          ) : (
            <div className="space-y-6">
              {modules.map((module, index) => {
                const isCompleted = completedModuleIds.has(module.id);
                const moduleRequirements = requirementsByModule[module.id] || [];
                
                return (
                  <div key={module.id} className="border rounded-lg bg-card">
                    {/* Module Header */}
                    <div className={`flex items-center justify-between p-4 border-b ${
                      isCompleted ? 'bg-green-50' : ''
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full border-2">
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium">{module.title}</h3>
                          {module.description && (
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                          )}
                          {isCompleted && (
                            <p className="text-xs text-green-600 mt-1">
                              Completed {new Date(progress?.find(p => p.module_id === module.id)?.completed_at || '').toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isCompleted && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Completed
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Interactive Requirements */}
                    {moduleRequirements.length > 0 && (
                      <InteractiveRequirements
                        requirements={moduleRequirements}
                        moduleId={module.id}
                        isCompleted={isCompleted}
                        sessionType={sessionType}
                        assignmentId={assignmentId}
                        onSave={saveRequirementResponses}
                      />
                    )}

                    {/* Equipment Assessment Section - Only show for assessment modules with equipment assessment enabled */}
                    {sessionType === 'assessment' && module.include_equipment_assessment && (
                      <div className="p-4 border-t">
                        <EquipmentAssessmentView
                          courseId={courseId}
                          moduleId={module.id}
                          traineeId={assignment.user_id}
                          canEdit={!isCompleted}
                          onComplete={async () => {
                            'use server';
                            // Use admin client to bypass RLS for trainers marking trainee progress
                            const supabaseService = supabaseAdmin();
                            const { error } = await supabaseService
                              .from("assignment_progress")
                              .upsert({
                                assignment_id: assignmentId,
                                module_id: module.id,
                                completed_at: new Date().toISOString()
                              }, {
                                onConflict: "assignment_id,module_id"
                              });
                            if (error) {
                              console.error("Error marking module complete:", error);
                            }
                            // Force page refresh to update progress
                            redirect(`/app/train-assess/course/${courseId}?trainee=${assignmentId}&type=${sessionType}`);
                          }}
                        />
                      </div>
                    )}

                    {/* No Requirements Message */}
                    {moduleRequirements.length === 0 && !isCompleted && !module.include_equipment_assessment && (
                      <div className="p-4 text-center text-muted-foreground">
                        <p className="text-sm">No specific requirements configured for this module.</p>
                        <p className="text-xs mt-1">Use the "Complete Training" button when finished.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {progressPercentage === 100 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">
              {sessionType === 'assessment' ? 'Assessment Complete!' : 'Training Complete!'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              {traineeName} has successfully completed all {sessionType} modules for "{course.title}".
              {sessionType === 'training' && ' They are now ready for onsite assessment.'}
            </p>
            <div className="flex flex-col gap-3 mt-4">
              {sessionType === 'assessment' && hasFailedRequirements && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-medium">
                    ⚠️ Cannot complete course: Some requirements are marked as "Fail"
                  </p>
                  <p className="text-red-600 text-sm mt-1">
                    Please review and update the failed requirements above before completing the course.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                {sessionType === 'assessment' && assignment.assignment_status !== 'completed' && !hasFailedRequirements && (
                  <CompleteCourseButton 
                    courseId={courseId}
                    assignmentId={assignmentId}
                    traineeName={traineeName}
                  />
                )}
                <Link href="/app/train-assess">
                  <Button variant={sessionType === 'assessment' ? 'outline' : 'default'}>
                    Return to Train & Assess Dashboard
                  </Button>
                </Link>
              </div>
            </div>
            {assignment.assignment_status === 'completed' && (
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-sm text-green-800 font-medium">
                  ✅ Course marked as completed
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
