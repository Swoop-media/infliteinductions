// @ts-nocheck
// app/app/creator/courses/[id]/quiz/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";

// Helpers
async function getCourseAndModule(courseId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // Fetch course (must be owner/Admin/SM per RLS)
  const { data: course, error: cErr } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (cErr || !course) {
    return { user, course: null, quizModule: null, err: cErr?.message ?? "Course not found" };
  }

  // Fetch existing quiz module (type = digital_assessment_quiz)
  const { data: modules, error: mErr } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .eq("type", "digital_assessment_quiz")
    .order("order_index", { ascending: true });

  const quizModule = modules?.[0] ?? null;
  return { user, course, quizModule, err: null };
}

async function ensureQuizModule(courseId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  // Make sure a quiz module exists (creator/Admin/SM per RLS)
  const { data: existing, error: eErr } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .eq("type", "digital_assessment_quiz")
    .limit(1);
  if (eErr) throw new Error(eErr.message);

  if (existing && existing.length > 0) {
    revalidatePath(`/app/creator/courses/${courseId}/quiz`);
    return existing[0];
  }

  const { data, error } = await supabase
    .from("course_modules")
    .insert({
      course_id: courseId,
      type: "digital_assessment_quiz",
      title: "Digital Quiz",
      order_index: 100,
      config: {},
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/app/creator/courses/${courseId}/quiz`);
  return data;
}

async function addQuestion(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const courseId = String(formData.get("course_id") || "");
  const moduleId = String(formData.get("module_id") || "");
  const stem = String(formData.get("stem") || "").trim();
  const type = String(formData.get("type") || "mcq");
  const points = Number(formData.get("points") || 1);

  if (!courseId || !moduleId || !stem) throw new Error("Missing fields");

  const { error } = await supabase.from("quiz_questions").insert({
    module_id: moduleId,
    stem,
    type,
    points,
    order_index: 0,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/app/creator/courses/${courseId}/quiz`);
}

async function addOption(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const courseId = String(formData.get("course_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const label = String(formData.get("label") || "").trim();
  const isCorrect = String(formData.get("is_correct") || "false") === "true";

  if (!courseId || !questionId || !label) throw new Error("Missing fields");

  const { error } = await supabase.from("quiz_options").insert({
    question_id: questionId,
    label,
    is_correct: isCorrect,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/app/creator/courses/${courseId}/quiz`);
}

async function loadQuestions(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const { data: questions, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id, stem, type, points, order_index, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true });

  if (qErr) throw new Error(qErr.message);

  // Fetch options for these questions
  const qIds = (questions ?? []).map((q) => q.id);
  let optionsMap: Record<string, any[]> = {};
  if (qIds.length > 0) {
    const { data: options, error: oErr } = await supabase
      .from("quiz_options")
      .select("id, question_id, label, is_correct")
      .in("question_id", qIds);
    if (oErr) throw new Error(oErr.message);

    optionsMap = (options ?? []).reduce((acc: Record<string, any[]>, opt) => {
      acc[opt.question_id] = acc[opt.question_id] || [];
      acc[opt.question_id].push(opt);
      return acc;
    }, {});
  }

  return { questions: questions ?? [], optionsMap };
}

export default async function QuizEditorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const courseId = params.id;
  const { course, quizModule, err } = await getCourseAndModule(courseId);
  if (err || !course) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Quiz Editor</h1>
        <p className="text-red-600">Error: {err ?? "Course not found or no access."}</p>
        <Link className="text-blue-600 underline" href="/app/creator">Back</Link>
      </div>
    );
  }

  let questions: any[] = [];
  let optionsMap: Record<string, any[]> = {};
  if (quizModule) {
    const loaded = await loadQuestions(quizModule.id);
    questions = loaded.questions;
    optionsMap = loaded.optionsMap;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quiz — {course.title ?? "Untitled Course"}</h1>
          <p className="text-sm text-gray-500">Manage questions for this course’s digital quiz module.</p>
        </div>
        <Link
          href={`/app/creator/courses/${courseId}`}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Back to Course
        </Link>
      </div>

      {!quizModule ? (
        <form action={async () => { await ensureQuizModule(courseId); }}>
          <button className="rounded-md bg-black px-4 py-2 text-white">
            Create Quiz Module
          </button>
        </form>
      ) : (
        <div className="space-y-8">
          <div className="rounded-xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Add Question</h2>
            <form action={addQuestion} className="space-y-3">
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="module_id" value={quizModule.id} />
              <div className="grid gap-2">
                <label className="text-sm">Question stem</label>
                <input
                  name="stem"
                  className="w-full rounded-md border px-3 py-2"
                  placeholder="e.g., What is the minimum safe distance?"
                  required
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="grid gap-1">
                  <label className="text-sm">Type</label>
                  <select name="type" className="rounded-md border px-3 py-2">
                    <option value="mcq">Multiple choice (single)</option>
                    <option value="multi">Multiple select</option>
                    <option value="true_false">True/False</option>
                    <option value="short_text">Short text</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-sm">Points</label>
                  <input
                    name="points"
                    type="number"
                    min={0}
                    defaultValue={1}
                    className="rounded-md border px-3 py-2"
                  />
                </div>
                <div className="flex items-end">
                  <button className="rounded-md bg-black px-4 py-2 text-white">
                    Add question
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="text-lg font-semibold mb-3">Questions</h2>
            {questions.length === 0 ? (
              <p className="text-sm text-gray-500">No questions yet.</p>
            ) : (
              <ul className="space-y-6">
                {questions.map((q) => (
                  <li key={q.id} className="rounded-md border p-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm text-gray-500">
                        {q.type} • {q.points} point{q.points === 1 ? "" : "s"}
                      </div>
                      <div className="font-medium">{q.stem}</div>
                    </div>

                    {(q.type === "mcq" || q.type === "multi" || q.type === "true_false") && (
                      <div className="mt-3">
                        <div className="text-sm font-semibold mb-2">Options</div>
                        <ul className="space-y-1">
                          {(optionsMap[q.id] ?? []).map((opt) => (
                            <li key={opt.id} className="text-sm">
                              {opt.label} {opt.is_correct ? <span className="text-green-600 font-medium">(correct)</span> : null}
                            </li>
                          ))}
                        </ul>

                        <form action={addOption} className="mt-3 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="course_id" value={courseId} />
                          <input type="hidden" name="question_id" value={q.id} />
                          <div className="grid gap-1">
                            <label className="text-xs">Label</label>
                            <input
                              name="label"
                              className="rounded-md border px-3 py-2"
                              placeholder="Option text"
                              required
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs">Correct?</label>
                            <select name="is_correct" className="rounded-md border px-3 py-2">
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </div>
                          <button className="rounded-md bg-black px-3 py-2 text-white">
                            Add option
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
