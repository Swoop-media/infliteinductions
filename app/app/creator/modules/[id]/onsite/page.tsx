// app/app/creator/modules/[id]/onsite/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import RequirementItem from "./RequirementItem";

export const dynamic = "force-dynamic";

/**
 * Onsite module builder (works for onsite_training & onsite_assessment)
 * - Save module title
 * - Create checklist requirements (trainer/assessor)
 * - Lists assigned learners
 * - Auto-picks next order_index per role to avoid unique-constraint collisions
 *
 * Tables:
 *  - course_modules
 *  - course_assignments (role='trainee')
 *  - profiles
 *  - onsite_requirements (unique: module_id, role, order_index)
 */

type Requirement = {
  id: string;
  module_id: string;
  role: "onsite_trainer" | "onsite_assessor" | "trainer" | "assessor";
  label: string | null;
  field_type: string | null;
  options: any;
  required: boolean | null;
  order_index: number | null;
  help_text: string | null;
  created_at: string | null;
};

type Learner = { id: string; full_name: string | null; email: string | null };

function roleToHuman(role: string) {
  if (role === "onsite_trainer" || role === "trainer") return "Trainer";
  if (role === "onsite_assessor" || role === "assessor") return "Assessor";
  return role;
}

function firstParam(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : (v ?? null);
}



// -----------------------------
// Loaders
// -----------------------------
async function loadData(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // Module
  const { data: mod, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title, created_at")
    .eq("id", moduleId)
    .maybeSingle();

  if (modErr || !mod) {
    return {
      mod: null as any,
      learners: [] as Learner[],
      trainerReqs: [] as Requirement[],
      assessorReqs: [] as Requirement[],
      nextFor: { trainer: 0, assessor: 0 } as { trainer: number; assessor: number },
      err: modErr?.message ?? "Module not found",
    };
  }

  if (mod.type !== "onsite_training" && mod.type !== "onsite_assessment") {
    return {
      mod: null as any,
      learners: [],
      trainerReqs: [],
      assessorReqs: [],
      nextFor: { trainer: 0, assessor: 0 },
      err: "This page is only for onsite modules.",
    };
  }

  // Learners (trainees) assigned to this course
  const { data: traineeIdsRows, error: trErr } = await supabase
    .from("course_assignments")
    .select("user_id")
    .eq("course_id", mod.course_id)
    .eq("role", "trainee");

  if (trErr) {
    return { mod, learners: [], trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, err: trErr.message };
  }

  const traineeIds = (traineeIdsRows ?? []).map((r) => r.user_id);
  let learners: Learner[] = [];
  if (traineeIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", traineeIds);

    if (pErr) {
      return { mod, learners: [], trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, err: pErr.message };
    }
    learners = (profs ?? []).sort((a, b) =>
      (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, { sensitivity: "base" })
    );
  }

  // Requirements
  const { data: reqs, error: rErr } = await supabase
    .from("onsite_requirements")
    .select("id, module_id, role, label, field_type, options, required, order_index, help_text, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (rErr) {
    return { mod, learners, trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, err: rErr.message };
  }

  const all = (reqs ?? []) as Requirement[];
  const trainerReqs = all.filter((r) => r.role === "onsite_trainer" || r.role === "trainer");
  const assessorReqs = all.filter((r) => r.role === "onsite_assessor" || r.role === "assessor");

  // Compute "next order index" suggestion for each role
  const nextFor = { trainer: 0, assessor: 0 };
  for (const r of all) {
    const key = (r.role === "onsite_assessor" || r.role === "assessor") ? "assessor" : "trainer";
    const oi = r.order_index ?? 0;
    if (oi >= nextFor[key]) nextFor[key] = oi + 1;
  }

  return { mod, learners, trainerReqs, assessorReqs, nextFor, err: null as string | null };
}

// -----------------------------
// Actions
// -----------------------------
async function saveTitleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const title = String(formData.get("title") || "").trim().slice(0, 200);
  if (!moduleId) throw new Error("Missing module_id");

  const { error } = await supabase
    .from("course_modules")
    .update({ title })
    .eq("id", moduleId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=title_saved`);
}

/** Add requirement, auto-choosing order_index per (module_id, role) if blank or collides */
async function addRequirementAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const roleRaw = String(formData.get("role") || "trainer").toLowerCase();
  const label = String(formData.get("label") || "").trim();
  const fieldType = String(formData.get("field_type") || "checkbox");
  const optionsRaw = String(formData.get("options") || "").trim();
  const required = String(formData.get("required") || "yes").toLowerCase() === "yes";
  const orderRaw = String(formData.get("order_index") || "").trim();
  const helpText = String(formData.get("help_text") || "").trim();

  if (!moduleId || !label) throw new Error("Missing fields");

  // Normalise role to DB convention
  const role = roleRaw === "assessor" || roleRaw === "onsite_assessor" ? "onsite_assessor" : "onsite_trainer";

  // options NOT NULL -> always an array
  let options: any = [];
  if (optionsRaw.length > 0) {
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) options = parsed;
    } catch {
      // keep []
    }
  }

  // Determine order_index
  const provided = orderRaw !== "" && Number.isFinite(Number(orderRaw));
  const providedNum = Number(orderRaw);

  // Current max for this (module, role)
  const { data: maxRow } = await supabase
    .from("onsite_requirements")
    .select("order_index")
    .eq("module_id", moduleId)
    .eq("role", role)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (maxRow?.order_index ?? -1) + 1;

  let order_index = provided ? providedNum : nextIndex;

  if (provided) {
    // If that slot is already used, push to end
    const { data: exists } = await supabase
      .from("onsite_requirements")
      .select("id")
      .eq("module_id", moduleId)
      .eq("role", role)
      .eq("order_index", providedNum)
      .maybeSingle();
    if (exists) order_index = nextIndex;
  }

  const { error } = await supabase.from("onsite_requirements").insert({
    module_id: moduleId,
    role,
    label,
    field_type: fieldType,
    options,
    required,
    order_index,
    help_text: helpText || null,
  });

  if (error) {
    // make the frequent unique error friendly
    if (error.code === "23505") {
      throw new Error("That order slot is already used. We placed it at the end for you. Try again.");
    }
    throw new Error(error.message);
  }

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirement_saved`);
}

/** Update existing requirement */
async function updateRequirementAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const requirementId = String(formData.get("requirement_id") || "");
  const moduleId = String(formData.get("module_id") || "");
  const label = String(formData.get("label") || "").trim();
  const fieldType = String(formData.get("field_type") || "checkbox");
  const optionsRaw = String(formData.get("options") || "").trim();
  const required = String(formData.get("required") || "yes").toLowerCase() === "yes";
  const orderRaw = String(formData.get("order_index") || "").trim();
  const helpText = String(formData.get("help_text") || "").trim();

  if (!requirementId || !moduleId || !label) throw new Error("Missing fields");

  // Parse options
  let options: any = [];
  if (optionsRaw.length > 0) {
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) options = parsed;
    } catch {
      // keep []
    }
  }

  const order_index = orderRaw !== "" && Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : null;

  const { error } = await supabase
    .from("onsite_requirements")
    .update({
      label,
      field_type: fieldType,
      options,
      required,
      order_index,
      help_text: helpText || null,
    })
    .eq("id", requirementId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirement_updated`);
}

/** Delete requirement */
async function deleteRequirementAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const requirementId = String(formData.get("requirement_id") || "");
  const moduleId = String(formData.get("module_id") || "");

  if (!requirementId || !moduleId) throw new Error("Missing fields");

  const { error } = await supabase
    .from("onsite_requirements")
    .delete()
    .eq("id", requirementId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirement_deleted`);
}

// -----------------------------
// Page
// -----------------------------
export default async function OnsiteModulePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const moduleId = params.id;
  const sp = await (props.searchParams ?? Promise.resolve({}));
  const ok = firstParam(sp, "ok");
  const errParam = firstParam(sp, "error");

  const { mod, learners, trainerReqs, assessorReqs, nextFor, err } = await loadData(moduleId);

  if (err || !mod) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Onsite Module</h1>
        <p className="text-red-600">Error: {err ?? "Module not found"}</p>
        <Link href="/app/creator" className="underline text-sm">
          ← Back to Creator
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {mod.type === "onsite_training" ? "Onsite Training" : "Onsite Assessment"}
          </h1>
          <p className="text-sm text-gray-500">
            Module: <span className="font-medium">{mod.title ?? "Untitled"}</span> • ID: {mod.id}
          </p>
        </div>
        <Link
          href={`/app/creator/courses/${mod.course_id}?tab=${mod.type}`}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Back to course
        </Link>
      </div>

      {/* Flash banners */}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {ok === "title_saved" && "Title saved."}
          {ok === "requirement_saved" && "Requirement saved."}
          {ok === "requirement_updated" && "Requirement updated."}
          {ok === "requirement_deleted" && "Requirement deleted."}
        </div>
      )}
      {errParam && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errParam}
        </div>
      )}

      {/* Save module title */}
      <div className="rounded-xl border p-4 space-y-3 bg-white">
        <h2 className="text-lg font-semibold">Module title</h2>
        <form action={saveTitleAction} className="flex items-center gap-2">
          <input type="hidden" name="module_id" value={mod.id} />
          <input
            name="title"
            defaultValue={mod.title ?? ""}
            placeholder="e.g. Onsite Assessment"
            className="w-[480px] max-w-full rounded-md border px-3 py-2"
          />
          <button className="rounded-md bg-black px-4 py-2 text-white">Save</button>
        </form>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Learners list */}
        <div className="rounded-xl border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Learners</h3>
          {learners.length === 0 ? (
            <p className="text-sm text-gray-500">No trainees assigned.</p>
          ) : (
            <ul className="space-y-1">
              {learners.map((l) => (
                <li key={l.id} className="text-sm">
                  {l.full_name || l.email || l.id}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add requirement + list */}
        <div className="rounded-xl border p-4 space-y-4">
          <details open className="space-y-3">
            <summary className="cursor-pointer text-sm font-semibold">Add requirement</summary>
            <form action={addRequirementAction} className="grid gap-3">
              <input type="hidden" name="module_id" value={mod.id} />

              <div className="grid gap-1">
                <label className="text-sm">Label</label>
                <input
                  name="label"
                  placeholder="e.g. Safety briefing delivered"
                  className="w-full rounded-md border px-3 py-2"
                  required
                />
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Role</label>
                <select name="role" defaultValue="trainer" className="rounded-md border px-3 py-2">
                  <option value="trainer">Trainer</option>
                  <option value="assessor">Assessor</option>
                </select>
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Field type</label>
                <select name="field_type" defaultValue="checkbox" className="rounded-md border px-3 py-2">
                  <option value="checkbox">Checkbox</option>
                  <option value="select">Select</option>
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                  <option value="rating">Rating</option>
                </select>
              </div>

              <div className="grid gap-1">
                <label className="text-sm">
                  Options (JSON array; required for Select/Rating, ignored otherwise)
                </label>
                <input
                  name="options"
                  placeholder='e.g. ["Pass","Fail"] or [1,2,3,4,5]'
                  className="w-full rounded-md border px-3 py-2"
                />
                <p className="text-xs text-gray-500">
                  If left blank, we’ll save an empty list <code>[]</code>.
                </p>
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Required?</label>
                <select name="required" defaultValue="yes" className="rounded-md border px-3 py-2">
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Order</label>
                <input
                  name="order_index"
                  type="number"
                  className="w-28 rounded-md border px-3 py-2"
                  placeholder="auto"
                />
                <p className="text-xs text-gray-500">
                  Leave blank to place it at the end (next • Trainer: {nextFor.trainer}, Assessor: {nextFor.assessor}).
                </p>
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Help text (optional)</label>
                <input
                  name="help_text"
                  className="w-full rounded-md border px-3 py-2"
                  placeholder="Short hint for the trainer/assessor"
                />
              </div>

              <div>
                <button className="rounded-md bg-black px-4 py-2 text-white">
                  Save requirement
                </button>
              </div>
            </form>
          </details>

          {/* Lists */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Checklist requirements</h4>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-medium text-gray-600">Trainer</h5>
              {trainerReqs.length === 0 ? (
                <p className="text-sm text-gray-500">No requirements yet.</p>
              ) : (
                <ul className="space-y-2">
                  {trainerReqs.map((r) => (
                    <RequirementItem 
                      key={r.id} 
                      requirement={r} 
                      moduleId={mod.id}
                      updateRequirementAction={updateRequirementAction}
                      deleteRequirementAction={deleteRequirementAction}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-medium text-gray-600">Assessor</h5>
              {assessorReqs.length === 0 ? (
                <p className="text-sm text-gray-500">No requirements yet.</p>
              ) : (
                <ul className="space-y-2">
                  {assessorReqs.map((r) => (
                    <RequirementItem 
                      key={r.id} 
                      requirement={r} 
                      moduleId={mod.id}
                      updateRequirementAction={updateRequirementAction}
                      deleteRequirementAction={deleteRequirementAction}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Responses panel (placeholder) */}
        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-semibold">Responses (select a learner)</h3>
          <p className="text-sm text-gray-500 mt-1">
            Pick a learner to fill responses.
          </p>
        </div>
      </div>
    </div>
  );
}
