/* Course Editor with Visual Assessor Form Builder (reads course_id from form) */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import AssessorBuilder from "@/components/AssessorBuilder";

type Course = {
  id: string;
  title: string | null;
  summary: string | null;
  content_md: string | null;
  status: "draft" | "published" | "archived";
  validity_months: number | null;
  expiry_fixed_date: string | null;
  retake_lead_days: number | null;
  tags: string[] | null;
  creator_id: string | null;
  updated_at: string;
  created_at: string;
};

type Module = {
  id: string;
  course_id: string;
  kind: "digital" | "onsite_training" | "onsite_assessment" | "quiz";
  position: number;
  config: any;
};

type AssessorSchema = {
  id: string;
  course_id: string;
  module: "onsite_training" | "onsite_assessment";
  schema: any;
};

type Quiz = {
  id: string;
  course_id: string;
  pass_mark: number;
  max_attempts: number;
  shuffle: boolean;
};

type QuizQuestion = {
  id: string;
  quiz_id: string;
  prompt: string;
  choices: any;
  correct: any;
  explanation: string | null;
  position: number;
};

type CourseDomain = { id: string; domain: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium">{children}</label>;
}

export const dynamic = "force-dynamic";

export default async function CourseEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const supabase = createSupabaseServer();

  const isSM = await hasRole("Senior management");
  const isAdmin = await hasRole("Admin");

  const { data: course, error: cErr } = await supabase
    .from("courses")
    .select("*")
    .eq("id", params.id)
    .single<Course>();

  if (!course || cErr) notFound();
  if (!(isAdmin || isSM) && course.status !== "draft") {
    redirect("/app/creator?tab=courses&error=not_authorised");
  }

  const { data: modules = [] } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", course.id)
    .order("position", { ascending: true }) as { data: Module[] | null };

  const quizModule = modules.find((m) => m.kind === "quiz");

  const [{ data: quiz }, { data: questions = [] }] = await Promise.all([
    quizModule
      ? supabase.from("quizzes").select("*").eq("course_id", course.id).single<Quiz>()
      : Promise.resolve({ data: null as Quiz | null }),
    quizModule
      ? supabase
          .from("quiz_questions")
          .select("*")
          .in("quiz_id", [
            ...(await (async () => {
              const x = await supabase.from("quizzes").select("id").eq("course_id", course.id);
              return (x.data || []).map((r: any) => r.id);
            })()),
          ])
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as QuizQuestion[] }),
  ]);

  const { data: assessorSchemas = [] } = await supabase
    .from("assessor_form_schemas")
    .select("*")
    .eq("course_id", course.id) as { data: AssessorSchema[] | null };

  const { data: courseDomains = [] } = await supabase
    .from("course_allowed_domains")
    .select("id, domain")
    .eq("course_id", course.id) as { data: CourseDomain[] | null };

  const tab = (searchParams?.tab as string) || "details";

  // ---------- SERVER ACTIONS ----------
  async function updateBasics(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();

    const title = String(formData.get("title") || "").trim();
    if (!title) redirect(`/app/creator/courses/${params.id}?tab=details&error=Title+is+required`);
    const summary = (String(formData.get("summary") || "").trim() || null) as string | null;
    const content_md = (String(formData.get("content_md") || "").trim() || null) as string | null;

    const expiryMode = String(formData.get("expiry_mode") || "relative");
    const validity_months = expiryMode === "relative" ? toInt(formData.get("validity_months")) : null;
    const expiry_fixed_date =
      expiryMode === "fixed" ? (String(formData.get("expiry_fixed_date") || "") || null) : null;

    const retake_lead_days = toInt(formData.get("retake_lead_days")) ?? 30;

    const tagsRaw = String(formData.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = tagsRaw.length ? tagsRaw : null;

    const { error } = await supa
      .from("courses")
      .update({
        title,
        summary,
        content_md,
        validity_months,
        expiry_fixed_date,
        retake_lead_days,
        tags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (error) {
      redirect(
        `/app/creator/courses/${params.id}?tab=details&error=${encodeURIComponent(error.message)}`
      );
    }
    revalidatePath(`/app/creator/courses/${params.id}`);
    redirect(`/app/creator/courses/${params.id}?tab=details&ok=updated`);
  }

  async function saveAssessorSchema(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();

    const courseId = String(formData.get("course_id") || "");
    const moduleKind = String(formData.get("module")) as "onsite_training" | "onsite_assessment";
    const schemaStr = String(formData.get("schema") || "[]");

    if (!courseId) {
      redirect(`/app/creator?tab=courses&error=Missing+course_id`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(schemaStr || "[]");
      if (!Array.isArray(parsed)) throw new Error("Schema must be an array");
    } catch {
      redirect(`/app/creator/courses/${courseId}?tab=assessor&error=Invalid+schema`);
    }

    const existing = await supa
      .from("assessor_form_schemas")
      .select("id")
      .eq("course_id", courseId)
      .eq("module", moduleKind)
      .maybeSingle();

    if (existing.data?.id) {
      const { error } = await supa
        .from("assessor_form_schemas")
        .update({ schema: parsed, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id);
      if (error) {
        redirect(`/app/creator/courses/${courseId}?tab=assessor&error=${encodeURIComponent(error.message)}`);
      }
    } else {
      const { error } = await supa.from("assessor_form_schemas").insert([
        { course_id: courseId, module: moduleKind, schema: parsed },
      ]);
      if (error) {
        redirect(`/app/creator/courses/${courseId}?tab=assessor&error=${encodeURIComponent(error.message)}`);
      }
    }
    revalidatePath(`/app/creator/courses/${courseId}`);
    redirect(`/app/creator/courses/${courseId}?tab=assessor&ok=saved`);
  }

  async function saveQuizSettings(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();
    const pass_mark = toInt(formData.get("pass_mark")) ?? 80;
    const max_attempts = toInt(formData.get("max_attempts")) ?? 3;
    const shuffle = toBool(formData.get("shuffle"));

    const q = await supa.from("quizzes").select("id").eq("course_id", params.id).maybeSingle();
    if (q.data?.id) {
      const { error } = await supa
        .from("quizzes")
        .update({ pass_mark, max_attempts, shuffle })
        .eq("id", q.data.id);
      if (error) {
        redirect(`/app/creator/courses/${params.id}?tab=quiz&error=${encodeURIComponent(error.message)}`);
      }
    } else {
      const { error } = await supa.from("quizzes").insert([{ course_id: params.id, pass_mark, max_attempts, shuffle }]);
      if (error) {
        redirect(`/app/creator/courses/${params.id}?tab=quiz&error=${encodeURIComponent(error.message)}`);
      }
    }
    revalidatePath(`/app/creator/courses/${params.id}`);
    redirect(`/app/creator/courses/${params.id}?tab=quiz&ok=saved`);
  }

  async function addQuestion(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();
    const prompt = String(formData.get("prompt") || "").trim();
    const choicesRaw = String(formData.get("choices") || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const correctRaw = String(formData.get("correct") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!prompt || choicesRaw.length < 2 || correctRaw.length < 1) {
      redirect(`/app/creator/courses/${params.id}?tab=quiz&error=${encodeURIComponent("Provide a prompt, at least two choices, and at least one correct choice.")}`);
    }

    const quizRow = await supa.from("quizzes").select("id").eq("course_id", params.id).single();
    if (quizRow.error || !quizRow.data) {
      redirect(`/app/creator/courses/${params.id}?tab=quiz&error=${encodeURIComponent("Quiz not found for this course (enable the Quiz module first).")}`);
    }

    const choices = choicesRaw.map((text, idx) => ({ id: String(idx + 1), text }));
    const correct = correctRaw.map((c) => String(Number(c)));

    const current = await supa.from("quiz_questions").select("position").eq("quiz_id", quizRow.data.id);
    const position = (current.data || []).reduce((m, r) => Math.max(m, r.position || 0), 0) + 1;

    const { error } = await supa.from("quiz_questions").insert([
      { quiz_id: quizRow.data.id, kind: "mcq", prompt, choices, correct, position },
    ]);
    if (error) {
      redirect(`/app/creator/courses/${params.id}?tab=quiz&error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath(`/app/creator/courses/${params.id}`);
    redirect(`/app/creator/courses/${params.id}?tab=quiz&ok=added`);
  }

  async function addDomain(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();
    const domain = String(formData.get("domain") || "").trim().toLowerCase();
    if (!domain) {
      redirect(`/app/creator/courses/${params.id}?tab=domains&error=${encodeURIComponent("Enter a domain.")}`);
    }
    const { error } = await supa.from("course_allowed_domains").insert([{ course_id: params.id, domain }]);
    if (error) {
      redirect(`/app/creator/courses/${params.id}?tab=domains&error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath(`/app/creator/courses/${params.id}`);
    redirect(`/app/creator/courses/${params.id}?tab=domains&ok=added`);
  }

  async function setStatus(formData: FormData) {
    "use server";
    const supa = createSupabaseServer();
    const target = String(formData.get("target") || "draft") as "draft" | "published" | "archived";
    const can = (await hasRole("Senior management")) || (await hasRole("Admin"));
    if (!can) redirect(`/app/creator/courses/${params.id}?tab=publish&error=not_authorised`);

    const { error } = await supa.from("courses").update({ status: target, updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) {
      redirect(`/app/creator/courses/${params.id}?tab=publish&error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath(`/app/creator/courses/${params.id}`);
    redirect(`/app/creator/courses/${params.id}?tab=publish&ok=${target}`);
  }

  // ---------- UI ----------
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{course.title || "Untitled course"}</h2>
          <p className="text-xs text-muted-foreground">
            Status: <span className="font-medium">{course.status}</span> · Updated{" "}
            {new Date(course.updated_at || course.created_at).toLocaleString()}
          </p>
        </div>
        <Link href="/app/creator?tab=courses" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
          Back to list
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabLink href={`/app/creator/courses/${course.id}?tab=details`} active={tab === "details"}>Details</TabLink>
        <TabLink href={`/app/creator/courses/${course.id}?tab=modules`} active={tab === "modules"}>Modules</TabLink>
        <TabLink href={`/app/creator/courses/${course.id}?tab=assessor`} active={tab === "assessor"}>Assessor Forms</TabLink>
        <TabLink href={`/app/creator/courses/${course.id}?tab=quiz`} active={tab === "quiz"}>Quiz</TabLink>
        <TabLink href={`/app/creator/courses/${course.id}?tab=domains`} active={tab === "domains"}>Domains</TabLink>
        <TabLink href={`/app/creator/courses/${course.id}?tab=publish`} active={tab === "publish"}>Publish</TabLink>
      </div>

      {tab === "details" && (
        <form action={updateBasics} className="space-y-6">
          <Section title="Basics">
            <div>
              <Label>Title *</Label>
              <input name="title" required defaultValue={course.title || ""} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
            </div>
            <div>
              <Label>Summary</Label>
              <input name="summary" defaultValue={course.summary || ""} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
            </div>
            <div>
              <Label>Long content (Markdown)</Label>
              <textarea name="content_md" rows={8} defaultValue={course.content_md || ""} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <input name="tags" defaultValue={(course.tags || []).join(", ")} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
            </div>
          </Section>

          <Section title="Expiry & Retake">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="expiry_mode" value="relative" defaultChecked={!!course.validity_months} />
                Relative expiry (months)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="expiry_mode" value="fixed" defaultChecked={!course.validity_months && !!course.expiry_fixed_date} />
                Fixed expiry date
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Validity (months)</Label>
                <input type="number" name="validity_months" min={1} defaultValue={course.validity_months ?? ""} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
              </div>
              <div>
                <Label>Fixed expiry date</Label>
                <input type="date" name="expiry_fixed_date" defaultValue={course.expiry_fixed_date ? new Date(course.expiry_fixed_date).toISOString().slice(0, 10) : ""} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
              </div>
            </div>
            <div className="sm:w-60">
              <Label>Retake lead time (days)</Label>
              <input type="number" name="retake_lead_days" min={1} defaultValue={course.retake_lead_days ?? 30} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
            </div>
          </Section>

          <div className="flex items-center justify-end gap-2">
            <Link href="/app/creator?tab=courses" className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">Cancel</Link>
            <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">Save changes</button>
          </div>
        </form>
      )}

      {tab === "modules" && (
        <Section title="Modules">
          {modules.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No modules on this course.</div>
          ) : (
            <ul className="divide-y rounded-md border">
              {modules.map((m) => (
                <li key={m.id} className="flex items-center justify-between p-3">
                  <div className="text-sm">
                    <span className="font-medium">
                      {m.position}. {labelForKind(m.kind)}
                    </span>
                    {m.kind === "quiz" && <span className="ml-2 text-xs text-gray-500">Configured in the Quiz tab</span>}
                    {(m.kind === "onsite_training" || m.kind === "onsite_assessment") && (
                      <span className="ml-2 text-xs text-gray-500">Schema editable in Assessor tab</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Add/remove/reorder to come later.</p>
        </Section>
      )}

      {tab === "assessor" && (
        <div className="space-y-6">
          <AssessorBuilder
            courseId={course.id}
            module="onsite_training"
            initialSchema={(assessorSchemas.find((s) => s.module === "onsite_training")?.schema as any[]) || null}
            action={saveAssessorSchema}
            title="Onsite Training form"
          />
          <AssessorBuilder
            courseId={course.id}
            module="onsite_assessment"
            initialSchema={(assessorSchemas.find((s) => s.module === "onsite_assessment")?.schema as any[]) || null}
            action={saveAssessorSchema}
            title="Onsite Assessment form"
          />
        </div>
      )}

      {tab === "quiz" && (
        <div className="space-y-6">
          <form action={saveQuizSettings} className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Quiz settings</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Pass mark (%)</Label>
                <input type="number" name="pass_mark" min={1} max={100} defaultValue={quiz?.pass_mark ?? 80} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
              </div>
              <div>
                <Label>Max attempts</Label>
                <input type="number" name="max_attempts" min={1} defaultValue={quiz?.max_attempts ?? 3} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" name="shuffle" defaultChecked={quiz?.shuffle ?? true} />
                Shuffle questions
              </label>
            </div>
            <div className="flex items-center justify-end">
              <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">Save settings</button>
            </div>
          </form>

          <Section title="Questions">
            {questions.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No questions yet.</div>
            ) : (
              <ul className="divide-y rounded-md border">
                {questions.map((q) => (
                  <li key={q.id} className="p-3">
                    <div className="text-sm"><span className="font-medium">{q.position}. {q.prompt}</span></div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {(q.choices || []).map((c: any) => {
                        const isCorrect = (q.correct || []).includes(c.id);
                        return (
                          <li key={c.id} className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${isCorrect ? "bg-green-500" : "bg-gray-300"}`} />
                            <span>{c.id}.) {c.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            <form action={addQuestion} className="mt-4 space-y-3 rounded-lg border p-4">
              <h4 className="text-sm font-medium">Add MCQ</h4>
              <div>
                <Label>Prompt</Label>
                <input name="prompt" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" placeholder="Question text" />
              </div>
              <div>
                <Label>Choices (one per line)</Label>
                <textarea name="choices" rows={4} className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" placeholder={"First option\nSecond option\nThird option"} />
              </div>
              <div>
                <Label>Correct choices (numbers, comma-separated)</Label>
                <input name="correct" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" placeholder="e.g., 1 or 1,3" />
              </div>
              <div className="flex items-center justify-end">
                <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">Add question</button>
              </div>
            </form>
          </Section>
        </div>
      )}

      {tab === "domains" && (
        <div className="space-y-6">
          <Section title="Per-course allowed embed domains">
            {courseDomains.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                None added. Global defaults already include YouTube/Vimeo/Microsoft Stream/SharePoint.
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {courseDomains.map((d) => (
                  <li key={d.id} className="p-3 text-sm">{d.domain}</li>
                ))}
              </ul>
            )}

            <form action={addDomain} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input name="domain" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring" placeholder="e.g., training.example.com" />
              <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">Add domain</button>
            </form>
          </Section>
        </div>
      )}

      {tab === "publish" && (
        <Section title="Publish / Archive">
          <p className="text-sm text-muted-foreground">
            Only <span className="font-medium">Senior management</span> or <span className="font-medium">Admin</span> can publish/archive.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={setStatus}><input type="hidden" name="target" value="published" />
              <button type="submit" disabled={!(isAdmin || isSM)} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-50">Publish</button>
            </form>
            <form action={setStatus}><input type="hidden" name="target" value="draft" />
              <button type="submit" disabled={!(isAdmin || isSM)} className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-50">Set to Draft</button>
            </form>
            <form action={setStatus}><input type="hidden" name="target" value="archived" />
              <button type="submit" disabled={!(isAdmin || isSM)} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-50">Archive</button>
            </form>
          </div>
        </Section>
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"}`}
    >
      {children}
    </Link>
  );
}
function labelForKind(kind: Module["kind"]) {
  switch (kind) {
    case "digital": return "Digital training";
    case "onsite_training": return "Onsite training";
    case "onsite_assessment": return "Onsite assessment";
    case "quiz": return "Quiz";
  }
}
function toInt(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBool(v: FormDataEntryValue | null): boolean {
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}
