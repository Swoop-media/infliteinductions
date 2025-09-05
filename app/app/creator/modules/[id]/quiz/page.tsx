// app/app/creator/modules/[id]/quiz/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** ---------------- util helpers ---------------- */
function pick<T = any>(obj: any, keys: string[], fallback: T | null = null): T | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return fallback;
}
function getInt(fd: FormData, name: string): number | null {
  const v = fd.get(name);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function getBool(fd: FormData, name: string): boolean {
  const v = String(fd.get(name) ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** ---------------- types (loose to tolerate schema drift) ---------------- */
type ModuleRow = {
  id: string;
  course_id: string;
  type: string;
  title: string | null;
};
type QuizRow = Record<string, any>;
type QuestionRow = Record<string, any>;
type OptionRow = Record<string, any>;

/** ---------------- schema-aware helpers ---------------- */
async function signedUrl(path: string | null | undefined) {
  "use server";
  if (!path) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.storage.from("course-files").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

/** Try a select that might reference a column that doesn't exist. If it errors, run fallback() */
async function trySelect<T>(
  fn: () => Promise<{ data: T | null; error: any }>,
  fallback: () => Promise<{ data: T | null; error: any }>
) {
  try {
    const r = await fn();
    if (r?.error) return await fallback();
    return r;
  } catch {
    return await fallback();
  }
}

/** ---------------- loaders ---------------- */
async function loadModuleAndEnsureQuiz(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  // Role guard
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) redirect("/app?error=not_authorised");

  // Module
  const m = await supabase
    .from("course_modules")
    .select("id, course_id, type, title")
    .eq("id", moduleId)
    .maybeSingle();
  if (m.error || !m.data) throw new Error(m.error?.message || "Module not found");
  const mod = m.data as ModuleRow;
  if (mod.type !== "digital_assessment_quiz") {
    redirect(`/app/creator/modules/${moduleId}`); // wrong editor
  }

  // Find or create quiz
  let quiz: QuizRow | null = null;
  let hasModuleIdCol = true;

  // First: quiz by module_id (if column exists)
  const byModule = await trySelect(
    () =>
      supabase
        .from("quizzes")
        .select("*")
        .eq("module_id", moduleId)
        .maybeSingle(),
    async () => {
      hasModuleIdCol = false;
      return { data: null, error: null };
    }
  );

  if (byModule.data) {
    quiz = byModule.data as QuizRow;
  } else {
    // Try legacy: a course-level quiz (avoid using module_id if missing)
    const byCourse = await supabase
      .from("quizzes")
      .select("*")
      .eq("course_id", mod.course_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byCourse.data) {
      // migrate it to module if possible
      if (hasModuleIdCol) {
        const migrated = await supabase
          .from("quizzes")
          .update({ module_id: moduleId } as any)
          .eq("id", byCourse.data.id)
          .select("*")
          .single();
        quiz = migrated.data ?? byCourse.data;
      } else {
        quiz = byCourse.data;
      }
    } else {
      // Create a fresh quiz with the most-compatible payload first
      const base: any = { course_id: mod.course_id };
      if (hasModuleIdCol) base.module_id = moduleId;

      const tries: any[] = [
        { ...base, pass_mark: 80, max_attempts: 3, shuffle: true, show_feedback: true, time_limit_seconds: null },
        { ...base, pass_mark: 80, max_attempts: 3, shuffle: true },
        { ...base },
      ];

      for (const payload of tries) {
        const r = await supabase.from("quizzes").insert(payload).select("*").single();
        if (!r.error && r.data) {
          quiz = r.data as QuizRow;
          break;
        }
      }
      if (!quiz) throw new Error("Could not create quiz (schema mismatch).");
    }
  }

  return { module: mod, quiz: quiz as QuizRow, hasModuleIdCol };
}

/** Load questions + options using whichever FK columns exist (quiz_id | module_id | course_id) */
async function loadQuestionsWithOptions(quiz: QuizRow, mod: ModuleRow) {
  "use server";
  const supabase = await createSupabaseServer();

  // 1) Try quiz_id
  let qList: QuestionRow[] = [];
  let r1 = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", quiz.id)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  if (r1.error || (r1.data ?? []).length === 0) {
    // 2) Try module_id
    r1 = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("module_id", mod.id)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true });

    if (r1.error || (r1.data ?? []).length === 0) {
      // 3) Try course_id
      r1 = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("course_id", mod.course_id)
        .order("order_index", { ascending: true })
        .order("id", { ascending: true });
    }
  }
  qList = (r1.data ?? []) as QuestionRow[];

  if (qList.length === 0) return [] as { question: QuestionRow; options: OptionRow[] }[];

  const qIds = qList.map((q) => q.id);
  const r2 = await supabase
    .from("quiz_options")
    .select("*")
    .in("question_id", qIds)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  const allOptions = (r2.data ?? []) as OptionRow[];
  const byQ = new Map<string, OptionRow[]>();
  for (const o of allOptions) {
    const arr = byQ.get(o.question_id) ?? [];
    arr.push(o);
    byQ.set(o.question_id, arr);
  }

  // stable client-side order if order_index missing
  qList.sort((a, b) => {
    const ao = pick<number>(a, ["order_index"], 0) ?? 0;
    const bo = pick<number>(b, ["order_index"], 0) ?? 0;
    if (ao !== bo) return ao - bo;
    return String(a.id).localeCompare(String(b.id));
  });

  return qList.map((q) => ({ question: q, options: byQ.get(q.id) ?? [] }));
}

/** ---------------- actions ---------------- */

async function updateSettings(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const quizId = String(formData.get("quiz_id") || "");
  if (!moduleId || !quizId) throw new Error("Missing ids");

  // Build a tolerant update payload
  const payloads: any[] = [
    {
      pass_mark: getInt(formData, "pass_mark"),
      max_attempts: getInt(formData, "max_attempts"),
      shuffle: getBool(formData, "shuffle"),
      show_feedback: getBool(formData, "show_feedback"),
      time_limit_seconds: getInt(formData, "time_limit_seconds"),
    },
    {
      pass_mark: getInt(formData, "pass_mark"),
      max_attempts: getInt(formData, "max_attempts"),
      shuffle: getBool(formData, "shuffle"),
    },
    {
      pass_mark: getInt(formData, "pass_mark"),
      max_attempts: getInt(formData, "max_attempts"),
    },
  ];

  let ok = false;
  for (const p of payloads) {
    const clean: any = {};
    for (const [k, v] of Object.entries(p)) {
      if (v !== null && v !== undefined) clean[k] = v;
    }
    const r = await supabase.from("quizzes").update(clean).eq("id", quizId);
    if (!r.error) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error("Save failed (schema mismatch).");

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=saved`);
}

/** determine the next order_index for questions (best effort) */
async function nextQuestionOrder(quiz: QuizRow, mod: ModuleRow) {
  "use server";
  const supabase = await createSupabaseServer();
  const tries = [
    { col: "quiz_id", val: quiz.id },
    { col: "module_id", val: mod.id },
    { col: "course_id", val: mod.course_id },
  ];
  for (const t of tries) {
    try {
      const r = await supabase
        .from("quiz_questions")
        .select("order_index")
        .eq(t.col as any, t.val)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!r.error) {
        const next = ((r.data?.order_index ?? -1) as number) + 1;
        return next;
      }
    } catch {}
  }
  return 0;
}

/** Add question — supports: multiple_choice | true_false | short_answer (schema-tolerant) */
async function createQuestion(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const quizId = String(formData.get("quiz_id") || "");
  const qType = String(formData.get("question_type") || "multiple_choice");
  const body = String(formData.get("body") || "").trim();

  // for short_answer
  const ansCsv = String(formData.get("answers_csv") || "").trim();

  // for multiple_choice / true_false
  const o1 = String(formData.get("opt1") || "").trim();
  const o2 = String(formData.get("opt2") || "").trim();
  const o3 = String(formData.get("opt3") || "").trim();
  const o4 = String(formData.get("opt4") || "").trim();
  const correctIdx = Number(formData.get("correct") || "1"); // 1..4

  if (!moduleId || !quizId) throw new Error("Missing ids");
  if (!body) throw new Error("Question text required");

  // Role guard - ensure user has permission
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) throw new Error("Not authorized to create questions");

  // Load and verify module exists and user has access
  const m = await supabase
    .from("course_modules")
    .select("id, course_id, type")
    .eq("id", moduleId)
    .eq("type", "digital_assessment_quiz")
    .maybeSingle();
  if (m.error || !m.data) throw new Error(m.error?.message || "Module not found or not a quiz module");
  const mod = m.data as { id: string; course_id: string; type: string };

  // Verify user has access to the course (this should satisfy RLS)
  const courseCheck = await supabase
    .from("courses")
    .select("id, created_by")
    .eq("id", mod.course_id)
    .maybeSingle();
  if (courseCheck.error || !courseCheck.data) throw new Error("Course not found or no access");

  // Get next order index
  const nextOrder = await nextQuestionOrder({ id: quizId } as any, { id: moduleId, course_id: mod.course_id } as any);
  
  // Create question with proper schema structure - try multiple column names
  const basePayload = {
    module_id: moduleId,
    type: qType,
    points: 1,
    order_index: nextOrder,
  };

  // Use the correct column name from schema
  const questionPayload = {
    ...basePayload,
    stem: body,
  };

  const { data: qIns, error: qError } = await supabase
    .from("quiz_questions")
    .insert(questionPayload)
    .select("*")
    .single();

  if (qError || !qIns) {
    throw new Error("Could not create question: " + (qError?.message || "Unknown error"));
  }

  // SHORT ANSWER: store accepted answers
  if (qType === "short_answer") {
    const answers = ansCsv
      ? Array.from(new Set(ansCsv.split(",").map((s) => s.trim()).filter(Boolean)))
      : [];
    
    if (answers.length > 0) {
      // Store answers in a format that can be retrieved later
      const answersValue = answers.join(",");
      // Try to update with answers - ignore errors as this is best effort
      try {
        await supabase.from("quiz_questions")
          .update({ stem: `${body}\n\nAccepted answers: ${answersValue}` })
          .eq("id", qIns.id);
      } catch {}
    }
    
    revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
    redirect(`/app/creator/modules/${moduleId}/quiz?notice=question_created`);
    return;
  }

  // MULTIPLE CHOICE / TRUE-FALSE options
  let options: { label: string; is_correct: boolean }[] = [];
  if (qType === "true_false") {
    const correctTF = String(formData.get("tf_correct") || "true") === "true";
    options = [
      { label: "True", is_correct: correctTF },
      { label: "False", is_correct: !correctTF },
    ];
  } else {
    const opts = [o1, o2, o3, o4].filter(Boolean);
    if (opts.length < 2) throw new Error("At least two options");
    options = opts.map((label, i) => ({ label, is_correct: i + 1 === correctIdx }));
  }

  // Insert options — try several label/boolean column names; with and without order_index
  const labelCols = ["label_md", "label", "text", "title", "value"];
  const isCorrectCols = ["is_correct", "is_right", "correct"];

  // current max order_index (best effort)
  let baseOrder = 0;
  try {
    const { data: maxRow } = await supabase
      .from("quiz_options")
      .select("order_index")
      .eq("question_id", qIns.id)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseOrder = ((maxRow?.order_index ?? -1) as number) + 1;
  } catch {}

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const order_index = baseOrder + i;
    let inserted = false;

    // try WITH order_index
    for (const lcol of labelCols) {
      for (const ccol of isCorrectCols) {
        const r = await supabase
          .from("quiz_options")
          .insert({ question_id: qIns.id, [lcol]: opt.label, [ccol]: opt.is_correct, order_index } as any);
        if (!r.error) {
          inserted = true;
          break;
        }
      }
      if (inserted) break;
    }

    // retry WITHOUT order_index if needed
    if (!inserted) {
      for (const lcol of labelCols) {
        for (const ccol of isCorrectCols) {
          const r = await supabase
            .from("quiz_options")
            .insert({ question_id: qIns.id, [lcol]: opt.label, [ccol]: opt.is_correct } as any);
          if (!r.error) {
            inserted = true;
            break;
          }
        }
        if (inserted) break;
      }
    }

    if (!inserted) throw new Error("Could not create option (schema mismatch).");
  }

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=question_created`);
}

async function deleteQuestion(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const questionId = String(formData.get("question_id") || "");
  if (!moduleId || !questionId) throw new Error("Missing ids");

  await supabase.from("quiz_options").delete().eq("question_id", questionId);
  const d = await supabase.from("quiz_questions").delete().eq("id", questionId);
  if (d.error) throw new Error(d.error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=question_deleted`);
}

async function moveQuestion(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const quizId = String(formData.get("quiz_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const dir = String(formData.get("direction") || "up"); // up|down

  if (!moduleId || !quizId || !questionId) throw new Error("Missing ids");

  // Load module & list to compute swap client-side
  const modRes = await supabase.from("course_modules").select("id, course_id").eq("id", moduleId).maybeSingle();
  if (modRes.error || !modRes.data) {
    redirect(`/app/creator/modules/${moduleId}/quiz?notice=reordered`);
    return;
  }
  const mod = modRes.data as ModuleRow;

  const list = await loadQuestionsWithOptions({ id: quizId } as any, mod);
  const qs = list.map((x) => x.question);
  const idx = qs.findIndex((q) => q.id === questionId);
  if (idx < 0) {
    redirect(`/app/creator/modules/${moduleId}/quiz?notice=reordered`);
    return;
  }
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= qs.length) {
    redirect(`/app/creator/modules/${moduleId}/quiz?notice=reordered`);
    return;
  }

  // Only attempt reorder if order_index exists
  if (!("order_index" in (qs[idx] as any)) || !("order_index" in (qs[swapWith] as any))) {
    redirect(`/app/creator/modules/${moduleId}/quiz?notice=reordered`);
    return;
  }

  const a = qs[idx] as any;
  const b = qs[swapWith] as any;
  const ao = a.order_index ?? idx;
  const bo = b.order_index ?? swapWith;

  try {
    await supabase.from("quiz_questions").update({ order_index: bo }).eq("id", a.id);
    await supabase.from("quiz_questions").update({ order_index: ao }).eq("id", b.id);
  } catch {}

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=reordered`);
}

async function setCorrectOption(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const optionId = String(formData.get("option_id") || "");
  if (!moduleId || !questionId || !optionId) throw new Error("Missing fields");

  // Detect existing boolean column on this options row
  const { data: oneOpt } = await supabase.from("quiz_options").select("*").eq("id", optionId).maybeSingle();
  const boolCols = ["is_correct", "correct", "is_right"];
  const boolCol = boolCols.find((c) => oneOpt && c in (oneOpt as any)) || "is_correct";

  // Reset all to false, set selected to true
  try {
    await supabase.from("quiz_options").update({ [boolCol]: false } as any).eq("question_id", questionId);
  } catch {}
  const { error } = await supabase.from("quiz_options").update({ [boolCol]: true } as any).eq("id", optionId);
  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=saved`);
}

async function addOption(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const labelText = String(formData.get("label_md") || "").trim();
  if (!moduleId || !questionId || !labelText) throw new Error("Missing fields");

  // next order (best-effort)
  let nextOrder = 0;
  try {
    const { data: maxRow } = await supabase
      .from("quiz_options")
      .select("order_index")
      .eq("question_id", questionId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextOrder = ((maxRow?.order_index ?? -1) as number) + 1;
  } catch {}

  const labelCols = ["label_md", "label", "text", "title", "value"];
  let ok = false;
  for (const col of labelCols) {
    const r = await supabase
      .from("quiz_options")
      .insert({ question_id: questionId, order_index: nextOrder, [col]: labelText, is_correct: false } as any);
    if (!r.error) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error("Could not add option (schema mismatch).");

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=option_added`);
}

async function deleteOption(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const optionId = String(formData.get("option_id") || "");
  if (!moduleId || !optionId) throw new Error("Missing fields");

  const { error } = await supabase.from("quiz_options").delete().eq("id", optionId);
  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=saved`);
}

async function updateQuestionText(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const body = String(formData.get("body_md") || "").trim();
  if (!moduleId || !questionId) throw new Error("Missing fields");

  // Try stem first (correct field), then fallback to other columns
  const textCols = ["stem", "body_md", "body", "question", "title", "prompt"];
  let updated = false;
  for (const col of textCols) {
    const r = await supabase.from("quiz_questions").update({ [col]: body } as any).eq("id", questionId);
    if (!r.error) {
      updated = true;
      break;
    }
  }
  if (!updated) throw new Error("Save failed (schema mismatch).");

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=saved`);
}

async function uploadQuestionImage(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const quizId = String(formData.get("quiz_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const file = formData.get("file") as File | null;
  if (!moduleId || !quizId || !questionId || !file) throw new Error("Missing fields");

  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "bin";
  const path = `quiz-questions/${quizId}/${questionId}/${crypto.randomUUID()}.${ext}`;
  const ab = await file.arrayBuffer();

  const up = await supabase
    .storage
    .from("course-files")
    .upload(path, new Uint8Array(ab), { upsert: false, contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(up.error.message);

  const imgCols = ["image_path", "image", "img", "media_path"];
  let ok = false;
  for (const col of imgCols) {
    const r = await supabase.from("quiz_questions").update({ [col]: path } as any).eq("id", questionId);
    if (!r.error) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error("Save failed (image column mismatch).");

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=image_uploaded`);
}

async function removeQuestionImage(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const questionId = String(formData.get("question_id") || "");
  if (!moduleId || !questionId) throw new Error("Missing fields");

  const imgCols = ["image_path", "image", "img", "media_path"];
  let ok = false;
  for (const col of imgCols) {
    const r = await supabase.from("quiz_questions").update({ [col]: null } as any).eq("id", questionId);
    if (!r.error) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new Error("Save failed (image column mismatch).");

  revalidatePath(`/app/creator/modules/${moduleId}/quiz`);
  redirect(`/app/creator/modules/${moduleId}/quiz?notice=saved`);
}

/** ---------------- page ---------------- */
export default async function QuizEditorPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const moduleId = id;
  const sp = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const notice = (Array.isArray(sp.notice) ? sp.notice[0] : sp.notice) ?? null;

  const { module, quiz } = await loadModuleAndEnsureQuiz(moduleId);
  const qAndO = await loadQuestionsWithOptions(quiz, module);

  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{module.title || "Digital Quiz"}</h1>
          <div className="text-xs text-gray-500">Module • Digital assessment (Quiz)</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/learn/quiz/modules/${module.id}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Preview as learner
          </Link>
          <Link
            href={`/app/creator/courses/${module.course_id}?tab=digital_assessment_quiz`}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Back to course
          </Link>
        </div>
      </div>

      {notice && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice === "question_created"
            ? "Question added."
            : notice === "question_deleted"
            ? "Question deleted."
            : notice === "image_uploaded"
            ? "Image uploaded."
            : notice === "reordered"
            ? "Order updated."
            : "Saved."}
        </div>
      )}

      {/* Settings */}
      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold">Quiz settings</h2>
        <form action={updateSettings} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="module_id" value={module.id} />
          <input type="hidden" name="quiz_id" value={quiz.id} />

          <label className="grid gap-1">
            <span className="text-sm">Pass mark (%)</span>
            <input
              type="number"
              name="pass_mark"
              min={0}
              max={100}
              defaultValue={pick<number>(quiz, ["pass_mark"], 80) ?? 80}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Max attempts</span>
            <input
              type="number"
              name="max_attempts"
              min={1}
              defaultValue={pick<number>(quiz, ["max_attempts"], 3) ?? 3}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shuffle" defaultChecked={!!pick(quiz, ["shuffle"], true)} />
            Shuffle questions
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="show_feedback" defaultChecked={!!pick(quiz, ["show_feedback"], true)} />
            Show answer feedback after submit
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Time limit (seconds, optional)</span>
            <input
              type="number"
              name="time_limit_seconds"
              min={0}
              placeholder="e.g., 600 for 10 minutes"
              defaultValue={pick<number>(quiz, ["time_limit_seconds"], null) ?? ""}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2">
            <button className="rounded-md bg-black px-4 py-2 text-sm text-white">Save settings</button>
          </div>
        </form>
      </section>

      {/* Add question */}
      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold">Add question</h2>
        <form action={createQuestion} className="space-y-3">
          <input type="hidden" name="module_id" value={module.id} />
          <input type="hidden" name="quiz_id" value={quiz?.id || ""} />

          <label className="grid gap-1">
            <span className="text-sm">Question type</span>
            <select name="question_type" defaultValue="multiple_choice" className="rounded-md border px-3 py-2 text-sm">
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">True / False</option>
              <option value="short_answer">Short answer</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Question text</span>
            <textarea name="body" rows={3} className="w-full rounded-md border px-3 py-2 text-sm" required />
          </label>

          {/* Multiple choice options */}
          <div className="grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <label key={i} className="grid gap-1">
                <span className="text-xs text-gray-600">Option {i}</span>
                <input name={`opt${i}`} className="rounded-md border px-3 py-2 text-sm" />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm">Correct option:</label>
            {[1, 2, 3, 4].map((i) => (
              <label key={i} className="flex items-center gap-1 text-sm">
                <input type="radio" name="correct" value={i} defaultChecked={i === 1} />
                {i}
              </label>
            ))}
          </div>

          {/* True/False correct */}
          <div className="flex items-center gap-3">
            <label className="text-sm">True/False correct:</label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="tf_correct" value="true" defaultChecked /> True
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="tf_correct" value="false" /> False
            </label>
          </div>

          {/* Short answer accepted answers (CSV) */}
          <label className="grid gap-1">
            <span className="text-sm">Accepted answers (CSV)</span>
            <input
              name="answers_csv"
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="e.g., ACME, Acme Corp, Acme"
            />
          </label>

          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">+ Add question</button>
        </form>
        <p className="text-xs text-gray-500">
          Tip: The form includes fields for all types; only the relevant ones are used based on “Question type”.
        </p>
      </section>

      {/* Questions list */}
      <section className="rounded-xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold">Questions</h2>

        {qAndO.length === 0 ? (
          <p className="text-sm text-gray-500">No questions yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {await Promise.all(
              qAndO.map(async ({ question, options }) => {
                const body = pick<string>(question, ["stem", "body_md", "body", "text", "question", "title", "prompt"], "") ?? "";
                const qType = pick<string>(question, ["type", "question_type", "format"], "multiple_choice") ?? "multiple_choice";
                const imgPath = pick<string>(question, ["image_path", "image", "img", "media_path"], null);
                const imgUrl = await signedUrl(imgPath);

                // For short answer, show stored acceptable answers (best-effort)
                const answersStored =
                  pick<string>(question, ["answer_md", "answers_md", "answer", "answers", "correct_answer", "solution"], "") ?? "";

                return (
                  <li key={question.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium">
                        <span className="mr-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-700">
                          {qType.replace("_", " ")}
                        </span>
                        Q{(question.order_index ?? 0) + 1}.{" "}
                        <span className="font-normal whitespace-pre-wrap">{body}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <form action={moveQuestion}>
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="quiz_id" value={quiz.id} />
                          <input type="hidden" name="question_id" value={question.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move up">
                            ↑
                          </button>
                        </form>
                        <form action={moveQuestion}>
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="quiz_id" value={quiz.id} />
                          <input type="hidden" name="question_id" value={question.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move down">
                            ↓
                          </button>
                        </form>
                        <form action={deleteQuestion}>
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="question_id" value={question.id} />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-red-50" title="Delete">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* Edit text */}
                    <details className="text-sm">
                      <summary className="cursor-pointer underline">Edit text</summary>
                      <form action={updateQuestionText} className="mt-2 flex items-end gap-2">
                        <input type="hidden" name="module_id" value={module.id} />
                        <input type="hidden" name="question_id" value={question.id} />
                        <textarea
                          name="body_md"
                          defaultValue={body}
                          rows={3}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                      </form>
                    </details>

                    {/* Image */}
                    <div className="space-y-2">
                      {imgUrl ? (
                        <div className="rounded border p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl} alt="Question image" className="max-h-64 w-auto" />
                          <form action={removeQuestionImage} className="mt-2">
                            <input type="hidden" name="module_id" value={module.id} />
                            <input type="hidden" name="question_id" value={question.id} />
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50">Remove image</button>
                          </form>
                        </div>
                      ) : (
                        <form action={uploadQuestionImage} className="flex items-center gap-2">
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="quiz_id" value={quiz.id} />
                          <input type="hidden" name="question_id" value={question.id} />
                          <input type="file" name="file" className="text-sm" />
                          <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50">Upload image</button>
                        </form>
                      )}
                    </div>

                    {/* Options / Answers */}
                    {qType === "short_answer" ? (
                      <div className="rounded-md border p-3 text-sm">
                        <div className="mb-1 font-medium">Accepted answers (CSV)</div>
                        <div className="text-xs text-gray-600 mb-2">
                          Stored best-effort in a compatible column. Case sensitivity is handled by the learner engine.
                        </div>
                        <form action={updateQuestionText} className="flex items-end gap-2">
                          {/* Reuse updateQuestionText by sending the CSV via body_md */}
                          <input type="hidden" name="module_id" value={module.id} />
                          <input type="hidden" name="question_id" value={question.id} />
                          <input
                            name="body_md"
                            defaultValue={answersStored}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                          />
                          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                        </form>
                      </div>
                    ) : (
                      <div className="rounded-md border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="px-3 py-2 text-left">Correct</th>
                              <th className="px-3 py-2 text-left">Option</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {options.map((o) => {
                              const label =
                                pick<string>(o, ["label_md", "label", "text", "title", "value"], "") ?? "";
                              const isCorrect =
                                (o as any).is_correct ?? (o as any).correct ?? (o as any).is_right ?? false;
                              return (
                                <tr key={o.id} className="border-b">
                                  <td className="px-3 py-2 align-top">
                                    <form action={setCorrectOption}>
                                      <input type="hidden" name="module_id" value={module.id} />
                                      <input type="hidden" name="question_id" value={question.id} />
                                      <input type="hidden" name="option_id" value={o.id} />
                                      <button
                                        className={[
                                          "rounded px-2 py-1 text-xs",
                                          isCorrect
                                            ? "border border-green-600 text-green-700"
                                            : "border hover:bg-gray-50",
                                        ].join(" ")}
                                        title="Mark as correct"
                                      >
                                        {isCorrect ? "✔" : "Set"}
                                      </button>
                                    </form>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="whitespace-pre-wrap">{label}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <form action={deleteOption}>
                                      <input type="hidden" name="module_id" value={module.id} />
                                      <input type="hidden" name="option_id" value={o.id} />
                                      <button className="rounded border px-2 py-1 text-xs hover:bg-red-50">
                                        Delete
                                      </button>
                                    </form>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2">
                                <form action={addOption} className="flex items-center gap-2">
                                  <input type="hidden" name="module_id" value={module.id} />
                                  <input type="hidden" name="question_id" value={question.id} />
                                  <input
                                    name="label_md"
                                    placeholder="New option text…"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                  />
                                  <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Add</button>
                                </form>
                              </td>
                              <td className="px-3 py-2"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </section>
    </div>
  );
}