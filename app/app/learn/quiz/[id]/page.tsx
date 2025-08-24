import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Accepts either:
 *  - a module ID (preferred) → resolve course_id from course_modules
 *  - a course ID (fallback)  → use directly
 * Looks up a quiz by module_id first, then by course_id.
 */
async function resolveQuizFromParam(id: string) {
  "use server";
  const supabase = await createSupabaseServer();

  // Try as module
  const { data: mod } = await supabase
    .from("course_modules")
    .select("id, course_id, type")
    .eq("id", id)
    .maybeSingle();

  let courseId: string | null = null;
  let moduleId: string | null = null;

  if (mod) {
    courseId = mod.course_id;
    moduleId = mod.id;
  } else {
    // Treat param as a course id
    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    courseId = course?.id ?? null;
  }

  if (!courseId) return { quiz: null, courseId: null, moduleId: null };

  // First try quiz attached to module_id (if schema supports it)
  if (moduleId) {
    const byModule = await supabase
      .from("quizzes")
      .select("id, course_id, module_id, pass_mark, max_attempts, shuffle")
      .eq("module_id", moduleId)
      .maybeSingle();
    if (byModule.data) {
      return { quiz: byModule.data, courseId, moduleId };
    }
  }

  // Fallback: quiz attached to course_id (common schema)
  const byCourse = await supabase
    .from("quizzes")
    .select("id, course_id, module_id, pass_mark, max_attempts, shuffle")
    .eq("course_id", courseId)
    .maybeSingle();

  return { quiz: byCourse.data ?? null, courseId, moduleId };
}

async function loadQuestions(quizId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  // Keep it generic: id, prompt, choices, correct/answer fields
  const { data } = await supabase
    .from("quiz_questions")
    .select("id, order_index, prompt, type, choices, correct_answer, answer")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  return data ?? [];
}

export default async function LearnerQuizPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  // Allow preview via course/module page (?preview=1) – we don't enforce here,
  // the course view already gated access.

  const { quiz, courseId, moduleId } = await resolveQuizFromParam(id);
  if (!quiz || !courseId) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Quiz</h1>
        <p className="text-red-600">Quiz not found for this module.</p>
        {courseId ? (
          <Link href={`/app/learn/courses/${courseId}`} className="underline">Back</Link>
        ) : (
          <Link href="/app/courses" className="underline">Back</Link>
        )}
      </div>
    );
  }

  const questions = await loadQuestions(quiz.id);
  const backHref = `/app/learn/courses/${courseId}${moduleId ? `?step=${1}` : ""}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quiz</h1>
        <Link href={backHref} className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          Back
        </Link>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-md border bg-white p-4">
          <p className="text-sm text-gray-600">No questions configured yet.</p>
        </div>
      ) : (
        <form
          action={async (fd: FormData) => {
            "use server";
            const sb = await createSupabaseServer();
            // read answers
            const answers: Record<string, string> = {};
            for (const q of questions) {
              const key = `q_${q.id}`;
              answers[q.id] = String(fd.get(key) ?? "");
            }

            // Try to store attempt (best effort; ignore if tables don’t exist)
            try {
              let attemptId: string | null = null;
              const { data: a } = await sb
                .from("quiz_attempts")
                .insert({
                  quiz_id: quiz.id,
                  user_id: user?.id ?? null,
                  raw_answers: answers,
                })
                .select("id")
                .single();
              attemptId = a?.id ?? null;

              if (attemptId) {
                for (const [qid, choice] of Object.entries(answers)) {
                  await sb.from("quiz_attempt_answers").insert({
                    attempt_id: attemptId,
                    question_id: qid,
                    choice,
                  });
                }

                // Send Teams notification for quiz completion
                if (user?.id) {
                  try {
                    const { createNotification } = await import("@/app/app/_actions/notifications");
                    await createNotification({
                      recipientUserId: user.id,
                      type: "quiz_completed",
                      title: "Quiz Completed! 🎉",
                      body: `You've successfully completed the quiz. Great work!`,
                      data: {
                        quizId: quiz.id,
                        courseId: courseId,
                        attemptId: attemptId
                      }
                    });
                  } catch (notifyError) {
                    console.warn("Failed to send completion notification:", notifyError);
                  }
                }
              }
            } catch { /* ignore */ }

            redirect(`/app/learn/courses/${courseId}?notice=saved`);
          }}
          className="space-y-4 rounded-md border bg-white p-4"
        >
          {questions.map((q, idx) => {
            const opts: string[] = Array.isArray(q.choices) ? q.choices : [];
            return (
              <div key={q.id} className="space-y-2">
                <div className="font-medium">
                  {idx + 1}. {q.prompt ?? "(no prompt)"}
                </div>
                <div className="space-y-1">
                  {opts.length ? (
                    opts.map((opt, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={`q_${q.id}`} value={opt} required />
                        <span>{opt}</span>
                      </label>
                    ))
                  ) : (
                    <input
                      name={`q_${q.id}`}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Your answer"
                      required
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <button className="rounded-md bg-black px-4 py-2 text-sm text-white">
              Submit
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
