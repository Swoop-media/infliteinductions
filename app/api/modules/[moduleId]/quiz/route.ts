// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  getPinnedCourseContext,
  findPinnedModule,
  findPinnedQuiz,
} from "@/lib/course-version";
import { NextRequest, NextResponse } from "next/server";

/**
 * Learner-mode quiz endpoint.
 *
 * By default this route serves the pinned quiz for a trainee's immutable
 * assignment snapshot. It requires an authenticated trainee assignment context
 * and NEVER falls back to mutable live quizzes/questions/options or synthesises
 * default quiz settings. Mutating live course content can therefore not change
 * the quiz an in-flight learner sees.
 *
 * A separate, strictly-scoped contractor branch (triggered by a
 * `registrationId` query param) serves the live external-contractor quiz. That
 * branch only activates after verifying the contractor registration belongs to
 * a published external-contractor course that contains the requested live
 * module, and it never weakens the internal trainee authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params;

  try {
    const searchParams = request.nextUrl.searchParams;
    const registrationId = searchParams.get("registrationId") || undefined;

    const sb = supabaseAdmin();

    // ---- Contractor branch (external contractors, live quiz) --------------
    if (registrationId) {
      return await handleContractorQuiz(sb, moduleId, registrationId);
    }

    // ---- Internal trainee branch (pinned snapshot, no live fallback) -------
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assignmentId = searchParams.get("assignmentId") || undefined;
    const courseId = searchParams.get("courseId") || undefined;
    const quizId = searchParams.get("quizId") || undefined;

    // Resolve the authenticated learner's pinned assignment context. Fail
    // closed if no immutable trainee assignment/version can be derived.
    let context: any = null;
    let module: any = null;

    if (assignmentId) {
      // Explicit assignment: it must belong to the authenticated trainee.
      const resolved = await getPinnedCourseContext(sb, { assignmentId });
      if (resolved.assignment.user_id !== user.id) {
        return NextResponse.json(
          { error: "Not authorized for this assignment" },
          { status: 403 }
        );
      }
      context = resolved;
      module = findPinnedModule(context, moduleId);
    } else {
      // Derive the assignment from the authenticated trainee. When several
      // trainee assignments exist, the one whose pinned snapshot contains this
      // module (optionally narrowed by courseId) wins.
      let query = sb
        .from("course_assignments")
        .select("id, course_id")
        .eq("user_id", user.id)
        .eq("role", "trainee");
      if (courseId) query = query.eq("course_id", courseId);

      const { data: assignments, error: assignmentsError } = await query;
      if (assignmentsError) throw assignmentsError;

      let lastError: any = null;
      for (const candidate of assignments || []) {
        try {
          const resolved = await getPinnedCourseContext(sb, {
            assignmentId: candidate.id,
          });
          const found = (resolved.modules || []).find(
            (item: any) => item?.id === moduleId
          );
          if (found) {
            context = resolved;
            module = found;
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!context || !module) {
        return NextResponse.json(
          {
            error:
              lastError?.message ||
              "No pinned trainee assignment includes this module.",
          },
          { status: 404 }
        );
      }
    }

    // Resolve the pinned quiz for this module from the immutable snapshot.
    const quiz = findPinnedQuiz(module, quizId);

    const quizSettings = {
      id: quiz.id,
      module_id: quiz.module_id ?? moduleId,
      course_id: quiz.course_id ?? context.assignment.course_id,
      pass_mark: quiz.pass_mark ?? 70,
      max_attempts: quiz.max_attempts ?? 3,
      shuffle: quiz.shuffle ?? false,
      show_feedback: quiz.show_feedback ?? true,
    };

    const rawQuestions = Array.isArray(quiz.questions) ? quiz.questions : [];

    const questions = rawQuestions
      .slice()
      .sort(
        (a: any, b: any) =>
          (a?.order_index ?? a?.position ?? 0) -
          (b?.order_index ?? b?.position ?? 0)
      )
      .map((q: any) => {
        const questionText = q.question || q.stem || q.prompt || "";
        const questionType = q.type || q.kind || "mcq";

        const rawOptions = Array.isArray(q.options) ? q.options : [];
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
          quiz_id: q.quiz_id ?? quiz.id,
          module_id: quizSettings.module_id,
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
  } catch (error: any) {
    console.error("Error in quiz API:", error);
    const message = String(error?.message || "");
    // Missing pinned version/assignment => fail closed with 404, never a live
    // fallback for learner mode.
    if (
      message.includes("Pinned course version is unavailable") ||
      message.includes("Trainee course assignment not found") ||
      message.includes("not part of this assignment")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Contractor branch: verify the registration belongs to a published
 * external-contractor course that contains the requested live module, then
 * serve the live quiz (settings + questions + options). Fails closed (404)
 * otherwise. This never touches the internal trainee authorization path.
 */
async function handleContractorQuiz(
  sb: any,
  moduleId: string,
  registrationId: string
) {
  const verifiedCourseId = await verifyContractorModule(
    sb,
    moduleId,
    registrationId
  );
  if (!verifiedCourseId) {
    return NextResponse.json(
      { error: "Not authorized for this contractor module." },
      { status: 404 }
    );
  }

  const { data: quiz } = await sb
    .from("quizzes")
    .select("*")
    .eq("module_id", moduleId)
    .maybeSingle();

  const quizSettings = quiz
    ? quiz
    : {
        id: moduleId,
        module_id: moduleId,
        course_id: verifiedCourseId,
        pass_mark: 70,
        max_attempts: 3,
        shuffle: false,
        show_feedback: true,
      };

  let rawQuestions: any[] = [];
  if (quiz) {
    const { data: q1 } = await sb
      .from("quiz_questions")
      .select("*, options:quiz_options(*)")
      .eq("quiz_id", quizSettings.id)
      .order("order_index", { ascending: true });
    if (q1 && q1.length > 0) rawQuestions = q1;
  }

  const questions = rawQuestions.map((q: any) => {
    const questionText = q.question || q.stem || q.prompt || "";
    const questionType = q.type || q.kind || "mcq";

    const rawOptions = Array.isArray(q.options) ? q.options : [];
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
      module_id: quizSettings.module_id ?? moduleId,
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
}

/**
 * Returns the verified course id if the contractor registration belongs to a
 * published external-contractor course containing the given live module;
 * otherwise returns null. Mirrors the check in the content route (Next.js route
 * modules cannot share exports beyond HTTP handlers).
 */
async function verifyContractorModule(
  sb: any,
  moduleId: string,
  registrationId: string
): Promise<string | null> {
  const { data: registration, error: regError } = await sb
    .from("contractor_course_completions")
    .select("id, course_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (regError || !registration?.course_id) return null;

  const { data: module, error: moduleError } = await sb
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .eq("course_id", registration.course_id)
    .maybeSingle();
  if (moduleError || !module) return null;

  const { data: course, error: courseError } = await sb
    .from("courses")
    .select("id, external_contractors, status")
    .eq("id", registration.course_id)
    .eq("external_contractors", true)
    .eq("status", "published")
    .maybeSingle();
  if (courseError || !course) return null;

  return registration.course_id;
}
