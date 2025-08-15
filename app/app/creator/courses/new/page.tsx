/* Create Course (draft) — inserts course + selected modules (+ quiz shell)
   Access: Course creators | Senior management | Admin
*/
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasRole } from "@/lib/roles";
import { createSupabaseServer } from "@/lib/supabase/server";

// small helper for reading form data cleanly
function getBool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}
function getInt(fd: FormData, name: string): number | null {
  const v = fd.get(name);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  // Guard: only creators/SM/admin
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app?error=not_authorised");
  }

  // ---- SERVER ACTION --------------------------------------------------------
  async function createCourse(formData: FormData) {
    "use server";
    const supabase = createSupabaseServer();

    // required
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      redirect("/app/creator/courses/new?error=Title+is+required");
    }

    // optional
    const summary = String(formData.get("summary") || "").trim() || null;
    const content_md = String(formData.get("content_md") || "").trim() || null;

    // expiry mode
    const expiryMode = String(formData.get("expiry_mode") || "relative"); // "relative" | "fixed"
    const validity_months =
      expiryMode === "relative" ? getInt(formData, "validity_months") : null;
    const expiry_fixed_date =
      expiryMode === "fixed"
        ? (String(formData.get("expiry_fixed_date") || "") || null)
        : null;

    const retake_lead_days = getInt(formData, "retake_lead_days") ?? 30;

    // tags (comma-separated)
    const rawTags = String(formData.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = rawTags.length ? rawTags : null;

    // modules
    const mDigital = getBool(formData, "m_digital");
    const mTraining = getBool(formData, "m_onsite_training");
    const mAssessment = getBool(formData, "m_onsite_assessment");
    const mQuiz = getBool(formData, "m_quiz");

    // quiz options (only if mQuiz)
    const quiz_pass = getInt(formData, "quiz_pass") ?? 80;
    const quiz_attempts = getInt(formData, "quiz_attempts") ?? 3;
    const quiz_shuffle = getBool(formData, "quiz_shuffle");

    // Insert course (status 'draft'); creator_id is set via RLS check, we don’t need to include it
    const { data: course, error: cErr } = await supabase
      .from("courses")
      .insert([
        {
          title,
          summary,
          content_md,
          status: "draft",
          validity_months,
          expiry_fixed_date,
          retake_lead_days,
          tags,
        },
      ])
      .select()
      .single();

    if (cErr || !course) {
      redirect(
        `/app/creator/courses/new?error=${encodeURIComponent(
          cErr?.message || "failed_to_create_course"
        )}`
      );
    }

    const courseId = course.id as string;

    // Build module rows in order
    const modules: Array<{
      course_id: string;
      kind: "digital" | "onsite_training" | "onsite_assessment" | "quiz";
      position: number;
      config: any;
    }> = [];
    let pos = 1;
    if (mDigital) {
      modules.push({
        course_id: courseId,
        kind: "digital",
        position: pos++,
        config: { editor: "markdown" },
      });
    }
    if (mTraining) {
      modules.push({
        course_id: courseId,
        kind: "onsite_training",
        position: pos++,
        // starter schema: can be edited later in Course editor
        config: {
          schema: [
            { type: "long_text", key: "trainer_notes", label: "Trainer notes", required: false },
            { type: "checkbox", key: "ppe_checked", label: "PPE checked", required: true },
            { type: "date", key: "date", label: "Training date", required: true },
          ],
        },
      });
    }
    if (mAssessment) {
      modules.push({
        course_id: courseId,
        kind: "onsite_assessment",
        position: pos++,
        config: {
          schema: [
            { type: "long_text", key: "assessment", label: "Assessment summary", required: true },
            { type: "checkbox", key: "pass", label: "Pass", required: false },
            { type: "date", key: "assessed_on", label: "Assessed on", required: true },
          ],
        },
      });
    }
    if (mQuiz) {
      modules.push({
        course_id: courseId,
        kind: "quiz",
        position: pos++,
        config: {},
      });
    }

    if (modules.length) {
      const { error: mErr } = await supabase.from("course_modules").insert(modules);
      if (mErr) {
        // best-effort cleanup
        await supabase.from("courses").delete().eq("id", courseId);
        redirect(`/app/creator/courses/new?error=${encodeURIComponent(mErr.message)}`);
      }
    }

    // Create quiz shell if requested
    if (mQuiz) {
      const { error: qErr } = await supabase.from("quizzes").insert([
        {
          course_id: courseId,
          pass_mark: quiz_pass,
          max_attempts: quiz_attempts,
          shuffle: quiz_shuffle,
        },
      ]);
      if (qErr) {
        await supabase.from("courses").delete().eq("id", courseId);
        redirect(`/app/creator/courses/new?error=${encodeURIComponent(qErr.message)}`);
      }
    }

    // Done -> back to list (you can later redirect to /app/creator/courses/[id])
    redirect(`/app/creator?tab=courses&ok=created`);
  }

  // --------------------------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Course</h2>
        <Link
          href="/app/creator?tab=courses"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>

      <form action={createCourse} className="space-y-8">
        {/* Basics */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Basics
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Title *</label>
              <input
                name="title"
                required
                maxLength={160}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                placeholder="e.g., Ground Safety Induction"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Summary</label>
              <input
                name="summary"
                maxLength={300}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                placeholder="One-line summary learners will see"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Long content (Markdown)</label>
              <textarea
                name="content_md"
                rows={6}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                placeholder="# Heading&#10;Detailed content here…"
              />
              <p className="mt-1 text-xs text-gray-500">You can edit this later in the course editor.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Tags (comma-separated)</label>
              <input
                name="tags"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                placeholder="safety, induction"
              />
            </div>
          </div>
        </section>

        {/* Expiry & Retake */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Expiry & Retake
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="expiry_mode" value="relative" defaultChecked />
                Relative expiry (validity in months)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="expiry_mode" value="fixed" />
                Fixed expiry date
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Validity (months)</label>
                <input
                  type="number"
                  name="validity_months"
                  min={1}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                  placeholder="e.g., 24"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Fixed expiry date</label>
                <input
                  type="date"
                  name="expiry_fixed_date"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
                />
              </div>
            </div>
            <div className="sm:w-60">
              <label className="mb-1 block text-sm font-medium">Retake lead time (days)</label>
              <input
                type="number"
                name="retake_lead_days"
                min={1}
                defaultValue={30}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
              />
            </div>
          </div>
        </section>

        {/* Modules */}
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Modules
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border p-3">
              <input type="checkbox" name="m_digital" defaultChecked />
              <span className="text-sm">Digital training</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3">
              <input type="checkbox" name="m_onsite_training" defaultChecked />
              <span className="text-sm">Onsite training</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3">
              <input type="checkbox" name="m_onsite_assessment" defaultChecked />
              <span className="text-sm">Onsite assessment</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3">
              <input type="checkbox" name="m_quiz" />
              <span className="text-sm">Quiz</span>
            </label>
          </div>

          {/* Quiz options (always shown; ignored if Quiz unchecked) */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Quiz pass mark (%)</label>
              <input
                type="number"
                name="quiz_pass"
                min={1}
                max={100}
                defaultValue={80}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Max attempts</label>
              <input
                type="number"
                name="quiz_attempts"
                min={1}
                defaultValue={3}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" name="quiz_shuffle" defaultChecked />
              Shuffle questions
            </label>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/app/creator?tab=courses"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Create draft
          </button>
        </div>
      </form>
    </div>
  );
}
