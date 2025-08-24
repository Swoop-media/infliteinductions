import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Types (light) */
type ModuleRow = {
  id: string;
  course_id: string;
  type: "digital_assessment_quiz" | string;
  title: string | null;
};

type QuizRow = {
  id: string;
  course_id: string;
  module_id: string | null;
  pass_mark: number | null;
  max_attempts: number | null;
  shuffle: boolean | null;
  show_feedback?: boolean | null;
  time_limit_seconds?: number | null;
};

type QuestionRow = {
  id: string;
  quiz_id: string;
  order_index: number | null;
  body_md: string | null;
  image_path?: string | null;
};

type OptionRow = {
  id: string;
  question_id: string;
  order_index: number | null;
  label_md: string | null;
  is_correct: boolean | null;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  enrolment_id: string;
  user_id: string;
  score_pct: number;
  passed: boolean;
  answers?: any;
  created_at?: string | null;
};

/** Helpers */
const TYPE_ORDER_FOR_COURSE = [
  "digital_training",
  "digital_assessment_quiz",
  "onsite_training",
  "onsite_assessment",
] as const;

function pageUrl(moduleId: string, params?: Record<string, string>) {
  const p = new URLSearchParams(params ?? {});
  return `/app/learn/quiz/${moduleId}${p.toString() ? `?${p.toString()}` : ""}`;
}

async function signedUrl(path: string | null | undefined) {
  "use server";
  if (!path) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.storage.from("course-files").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Loaders */
async function loadAll(moduleId: string, preview: boolean) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !preview) redirect("/auth/signin");

  // Module (must be quiz)
  const { data: mod, error: mErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title")
    .eq("id", moduleId)
    .maybeSingle();
  if (mErr || !mod) return { error: "Module not found" } as const;
  if ((mod as ModuleRow).type !== "digital_assessment_quiz") {
    return { error: "This is not a quiz module." } as const;
  }

  // --- Find quiz: prefer module-scoped; fallback to latest for course (legacy) ---
  let quiz: QuizRow | null = null;
  let usedLegacy = false;

  const byModule = await supabase
    .from("quizzes")
    .select("*")
    .eq("module_id", moduleId)
    .limit(1)
    .maybeSingle();

  if (byModule.data) {
    quiz = byModule.data as QuizRow;
  } else {
    const byCourse = await supabase
      .from("quizzes")
      .select("*")
      .eq("course_id", (mod as ModuleRow).course_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byCourse.data) {
      quiz = byCourse.data as QuizRow;
      usedLegacy = true; // module_id was not set; we're using a course-level quiz row
    }
  }

  if (!quiz) return { error: "Quiz not found for this module." } as const;

  // Enrolment (skip for preview)
  let enrolment: any = null;
  if (!preview && user) {
    const { data: e } = await supabase
      .from("course_enrolments")
      .select("id, user_id, course_id, status, updated_at")
      .eq("course_id", (mod as ModuleRow).course_id)
      .eq("user_id", user.id)
      .maybeSingle();
    enrolment = e ?? null;

    if (!enrolment) redirect("/app/courses?error=not_enrolled");
    if (["pending", "rejected", "cancelled"].includes(enrolment.status)) {
      redirect("/app/courses?error=enrolment_not_approved");
    }
    if (enrolment.status === "approved") {
      await supabase.from("course_enrolments").update({ status: "in_progress" }).eq("id", enrolment.id);
      enrolment.status = "in_progress";
    }
  }

  // Questions + options
  const { data: qs } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, order_index, body_md, image_path")
    .eq("quiz_id", quiz.id)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  const questions = (qs ?? []) as QuestionRow[];

  let optionsByQ = new Map<string, OptionRow[]>();
  if (questions.length) {
    const { data: opts } = await supabase
      .from("quiz_options")
      .select("id, question_id, order_index, label_md, is_correct")
      .in("question_id", questions.map((q) => q.id))
      .order("order_index", { ascending: true })
      .order("id", { ascending: true });
    (opts ?? []).forEach((o) => {
      const arr = optionsByQ.get(o.question_id) ?? [];
      arr.push(o as OptionRow);
      optionsByQ.set(o.question_id, arr);
    });
  }

  // Attempts (best-effort)
  let attempts: AttemptRow[] = [];
  if (!preview && enrolment) {
    try {
      const { data: atts } = await supabase
        .from("quiz_attempts")
        .select("id, score_pct, passed, created_at")
        .eq("quiz_id", quiz.id)
        .eq("enrolment_id", enrolment.id)
        .order("created_at", { ascending: false });
      attempts = (atts ?? []) as any;
    } catch {
      // table may not exist yet — ignore
    }
  }

  // Shuffle if requested (questions and their options, but keep IDs)
  const shuffleOn = !!quiz.shuffle;
  const qOrdered = shuffleOn ? shuffle(questions) : questions;
  const qWithOptions = await Promise.all(
    qOrdered.map(async (q) => {
      const opts = optionsByQ.get(q.id) ?? [];
      const optsOrdered = shuffleOn ? shuffle(opts) : opts;
      const imgUrl = await signedUrl(q.image_path ?? null);
      return { question: q, options: optsOrdered, imageUrl: imgUrl };
    })
  );

  return {
    user,
    module: mod as ModuleRow,
    quiz: quiz as QuizRow,
    enrolment,
    qWithOptions,
    attempts,
    preview,
    usedLegacy,
    error: null as string | null,
  };
}

/** Helper for course-next-step after pass */
async function computeNextStepUrl(
  courseId: string,
  moduleId: string,
  preview: boolean
) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: mods } = await supabase
    .from("course_modules")
    .select("id, type, order_index")
    .eq("course_id", courseId);

  const list = (mods ?? []).slice().sort((a: any, b: any) => {
    const ta = TYPE_ORDER_FOR_COURSE.indexOf(a.type);
    const tb = TYPE_ORDER_FOR_COURSE.indexOf(b.type);
    if (ta !== tb) return ta - tb;
    const oa = a.order_index ?? 0;
    const ob = b.order_index ?? 0;
    return oa === ob ? String(a.id).localeCompare(String(b.id)) : oa - ob;
  });

  const idx = list.findIndex((m: any) => m.id === moduleId);
  const step = idx >= 0 ? idx + 1 : 1;
  const nextStep = Math.min(list.length, step + 1);
  const params = new URLSearchParams();
  params.set("notice", "saved");
  params.set("step", String(nextStep));
  if (preview) params.set("preview", "1");
  return `/app/learn/courses/${courseId}?${params.toString()}`;
}

/** ACTION: grade & record */
async function submitQuiz(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const quizId = String(formData.get("quiz_id") || "");
  const courseId = String(formData.get("course_id") || "");
  const preview = String(formData.get("preview") || "") === "1";

  if (!moduleId || !quizId || !courseId) throw new Error("Missing identifiers");

  // Load quiz config
  const { data: quiz } = await supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle();
  if (!quiz) redirect(pageUrl(moduleId, { error: "quiz_not_found" }));

  // Load questions & options to evaluate answers
  const { data: qs } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });
  const qIds = (qs ?? []).map((q) => q.id as string);

  let allOptions: any[] = [];
  if (qIds.length) {
    const { data: opts } = await supabase
      .from("quiz_options")
      .select("id, question_id, is_correct")
      .in("question_id", qIds);
    allOptions = opts ?? [];
  }

  // Map of question -> correct option ids
  const correctMap = new Map<string, string[]>();
  for (const o of allOptions) {
    if (o.is_correct) {
      const arr = correctMap.get(o.question_id) ?? [];
      arr.push(o.id);
      correctMap.set(o.question_id, arr);
    }
  }

  // Read submitted answers
  const answers: Record<string, { selected?: string; correct: boolean }> = {};
  let correctCount = 0;
  for (const qid of qIds) {
    const sel = String(formData.get(`q_${qid}`) || "");
    const correctIds = correctMap.get(qid) ?? [];
    const isCorrect = sel && correctIds.includes(sel);
    if (isCorrect) correctCount++;
    answers[qid] = { selected: sel || undefined, correct: isCorrect };
  }

  const total = qIds.length || 1;
  const score_pct = Math.round((correctCount / total) * 100);
  const passed = score_pct >= (quiz.pass_mark ?? 80);

  // Current user + enrolment
  let enrolmentId: string | null = null;
  let userId: string | null = null;
  if (!preview) {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth?.user?.id ?? null;
    if (!userId) redirect("/auth/signin");

    const { data: enrol } = await supabase
      .from("course_enrolments")
      .select("id, status")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!enrol) redirect("/app/courses?error=not_enrolled");
    enrolmentId = enrol.id;

    // Max attempts enforcement (best-effort if table exists)
    try {
      if (quiz.max_attempts != null) {
        const { data: prev } = await supabase
          .from("quiz_attempts")
          .select("id")
          .eq("quiz_id", quizId)
          .eq("enrolment_id", enrolmentId);
        const count = (prev ?? []).length;
        if (count >= quiz.max_attempts) {
          redirect(pageUrl(moduleId, { error: "attempts_exhausted" }));
        }
      }
    } catch {
      // attempts table might not exist yet — ignore hard enforcement
    }
  }

  // Record attempt (if table exists and not preview)
  if (!preview && enrolmentId && userId) {
    try {
      await supabase.from("quiz_attempts").insert({
        quiz_id: quizId,
        enrolment_id: enrolmentId,
        user_id: userId,
        score_pct,
        passed,
        answers,
      } as AttemptRow);
    } catch {
      // table may not exist — ignore
    }
  }

  // On pass: mark module as complete + try complete enrolment, then go back to the course at next step
  if (passed && !preview && enrolmentId) {
    try {
      await supabase
        .from("module_progress")
        .insert({ enrolment_id: enrolmentId, module_id: moduleId })
        .select()
        .single();
    } catch {}
    try {
      await supabase.rpc("try_complete_enrolment", { p_enrolment_id: enrolmentId });
    } catch {}

    const nextUrl = await computeNextStepUrl(courseId, moduleId, preview);
    revalidatePath(`/app/learn/courses/${courseId}`);
    redirect(nextUrl);
  }

  // Otherwise return to this page with result banner
  redirect(
    pageUrl(moduleId, {
      result: passed ? "pass" : "fail",
      score: String(score_pct),
    })
  );
}

/** PAGE */
export default async function QuizPlayerPage(props: {
  params: Promise<{ moduleId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { moduleId } = await props.params;
  const sp = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const preview = ((Array.isArray(sp.preview) ? sp.preview[0] : sp.preview) ?? "") === "1";
  const result = (Array.isArray(sp.result) ? sp.result[0] : sp.result) ?? null;
  const scoreStr = (Array.isArray(sp.score) ? sp.score[0] : sp.score) ?? null;
  const error = (Array.isArray(sp.error) ? sp.error[0] : sp.error) ?? null;

  const data = await loadAll(moduleId, preview);
  if (data.error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Quiz</h1>
        <p className="text-red-600">{data.error}</p>
        <Link href="/app/courses" className="underline">Back</Link>
      </div>
    );
  }

  const { module, quiz, enrolment, qWithOptions, attempts, usedLegacy } = data;
  const timeLimit = quiz.time_limit_seconds ?? null;

  // Attempt guard (best-effort; if table missing, attempts is [])
  const attemptsUsed = attempts.length;
  const maxAttempts = quiz.max_attempts ?? null;
  const attemptsLeft = maxAttempts == null ? null : Math.max(0, maxAttempts - attemptsUsed);
  const atLimit = !preview && maxAttempts != null && attemptsLeft === 0;

  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{module.title || "Quiz"}</h1>
          <div className="text-xs text-gray-500">Digital assessment</div>
          {preview && (
            <div className="mt-2 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs text-yellow-900 inline-block">
              Preview mode — results are not saved.
            </div>
          )}
        </div>
        <Link
          href={`/app/learn/courses/${module.course_id}?${preview ? "preview=1" : ""}`}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Back to course
        </Link>
      </div>

      {/* banners */}
      {usedLegacy && (
        <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Using course-level quiz (legacy). To link it to this module, set <code>module_id</code> on the quiz row.
        </div>
      )}
      {error === "attempts_exhausted" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          You’ve used all available attempts for this quiz.
        </div>
      )}
      {result && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            result === "pass"
              ? "border border-green-300 bg-green-50 text-green-800"
              : "border border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {result === "pass" ? "Passed" : "Not passed"}
          {typeof scoreStr === "string" ? ` — score ${scoreStr}%` : null}
        </div>
      )}
      {atLimit && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          No attempts left for this quiz.
        </div>
      )}

      {/* Quiz body */}
      <section className="rounded-xl border bg-white p-4 space-y-4">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
          <div>Pass mark: {quiz.pass_mark ?? 80}%</div>
          {maxAttempts != null && (
            <div>
              Attempts: {attemptsUsed}/{maxAttempts}
              {attemptsLeft != null ? ` • ${attemptsLeft} left` : ""}
            </div>
          )}
          {timeLimit != null && timeLimit > 0 && (
            <div id="timeLeft" className="rounded border px-2 py-0.5">
              Time left: {/* filled by script */}--
            </div>
          )}
        </div>

        {/* Questions form */}
        <form action={submitQuiz} className="space-y-6">
          <input type="hidden" name="module_id" value={module.id} />
          <input type="hidden" name="quiz_id" value={quiz.id} />
          <input type="hidden" name="course_id" value={module.course_id} />
          <input type="hidden" name="preview" value={preview ? "1" : ""} />

          {qWithOptions.length === 0 ? (
            <p className="text-sm text-gray-500">No questions yet.</p>
          ) : (
            <ul className="space-y-6">
              {await Promise.all(
                qWithOptions.map(async ({ question, options, imageUrl }, idx) => (
                  <li key={question.id} className="rounded-md border p-3 space-y-3">
                    <div className="text-sm font-medium">
                      {idx + 1}.{" "}
                      <span className="font-normal whitespace-pre-wrap">
                        {question.body_md ?? "(question text)"}
                      </span>
                    </div>

                    {imageUrl && (
                      <div className="rounded border p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt="Question image" className="max-h-64 w-auto" />
                      </div>
                    )}

                    <div className="space-y-2">
                      {options.length === 0 ? (
                        <div className="text-xs text-gray-500">No options.</div>
                      ) : (
                        options.map((o) => (
                          <label key={o.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name={`q_${question.id}`}
                              value={o.id}
                              className="mt-0.5"
                            />
                            <span className="whitespace-pre-wrap">{o.label_md}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-gray-500">
              {preview ? "Preview run — not recorded." : attempts.length ? `Last attempt: ${new Date(attempts[0].created_at ?? Date.now()).toLocaleString()}` : ""}
            </div>
            <button
              id="submitBtn"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={atLimit}
            >
              Submit quiz
            </button>
          </div>
        </form>

        {/* Time-limit script (client-side countdown + auto-submit) */}
        {timeLimit != null && timeLimit > 0 && !atLimit && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function(){
  try{
    var total = ${timeLimit};
    var el = document.getElementById('timeLeft');
    var btn = document.getElementById('submitBtn');
    var start = Date.now();
    function fmt(sec){ var m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
    function tick(){
      var used = Math.floor((Date.now()-start)/1000);
      var left = Math.max(0, total - used);
      if(el){ el.textContent = 'Time left: ' + fmt(left); }
      if(left <= 0){
        if(btn && !btn.disabled){ btn.click(); }
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }catch(e){}
})();`,
            }}
          />
        )}
      </section>
    </div>
  );
}
