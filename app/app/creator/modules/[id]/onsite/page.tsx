// @ts-nocheck

// app/app/creator/modules/[id]/onsite/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import SortableRequirements from "./SortableRequirements";

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
    .select("id, course_id, type, title, created_at, include_equipment_assessment")
    .eq("id", moduleId)
    .maybeSingle();

  if (modErr || !mod) {
    return {
      mod: null as any,
      learners: [] as Learner[],
      trainerReqs: [] as Requirement[],
      assessorReqs: [] as Requirement[],
      nextFor: { trainer: 0, assessor: 0 } as { trainer: number; assessor: number },
      hasEquipmentModule: false,
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
      hasEquipmentModule: false,
      err: "This page is only for onsite modules.",
    };
  }

  // Check if this course has equipment modules
  const { data: equipmentModules } = await supabase
    .from("module_content_blocks")
    .select("id, module_id")
    .eq("kind", "equipment_form")
    .in("module_id", 
      await supabase
        .from("course_modules")
        .select("id")
        .eq("course_id", mod.course_id)
        .then(result => result.data?.map(m => m.id) || [])
    );
  
  const hasEquipmentModule = equipmentModules && equipmentModules.length > 0;

  // Learners (trainees) assigned to this course
  const { data: traineeIdsRows, error: trErr } = await supabase
    .from("course_assignments")
    .select("user_id")
    .eq("course_id", mod.course_id)
    .eq("role", "trainee");

  if (trErr) {
    return { mod, learners: [], trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, hasEquipmentModule, err: trErr.message };
  }

  const traineeIds = (traineeIdsRows ?? []).map((r) => r.user_id);
  let learners: Learner[] = [];
  if (traineeIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", traineeIds);

    if (pErr) {
      return { mod, learners: [], trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, hasEquipmentModule, err: pErr.message };
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
    return { mod, learners, trainerReqs: [], assessorReqs: [], nextFor: { trainer: 0, assessor: 0 }, hasEquipmentModule, err: rErr.message };
  }

  const trainerReqs = (reqs ?? []).filter((r) => r.role === "onsite_trainer" || r.role === "trainer");
  const assessorReqs = (reqs ?? []).filter((r) => r.role === "onsite_assessor" || r.role === "assessor");

  // Next order_index for each role
  const maxTrainer = Math.max(...trainerReqs.map((r) => r.order_index ?? 0), -1);
  const maxAssessor = Math.max(...assessorReqs.map((r) => r.order_index ?? 0), -1);
  const nextFor = {
    trainer: maxTrainer + 1,
    assessor: maxAssessor + 1,
  };

  return { mod, learners, trainerReqs, assessorReqs, nextFor, hasEquipmentModule, err: null };
}

/** Save module title */
async function saveTitleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const title = String(formData.get("title") || "");

  const { error } = await supabase
    .from("course_modules")
    .update({ title })
    .eq("id", moduleId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=title_saved`);
}

/** Toggle equipment assessment */
async function toggleEquipmentAssessmentAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const includeEquipment = formData.get("include_equipment") === "on";

  const { error } = await supabase
    .from("course_modules")
    .update({ include_equipment_assessment: includeEquipment })
    .eq("id", moduleId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=equipment_assessment_updated`);
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

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirement_saved`);
}

/** Update a requirement (retaining order_index so no collision) */
async function updateRequirementAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const requirementId = String(formData.get("requirement_id") || "");
  const label = String(formData.get("label") || "").trim();
  const fieldType = String(formData.get("field_type") || "checkbox");
  const optionsRaw = String(formData.get("options") || "").trim();
  const required = String(formData.get("required") || "yes").toLowerCase() === "yes";
  const helpText = String(formData.get("help_text") || "").trim();
  const moduleId = String(formData.get("module_id") || "");

  if (!requirementId || !label) throw new Error("Missing fields");

  let options: any = [];
  if (optionsRaw.length > 0) {
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) options = parsed;
    } catch {
      // keep []
    }
  }

  const { error } = await supabase
    .from("onsite_requirements")
    .update({
      label,
      field_type: fieldType,
      options,
      required,
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

  const { error } = await supabase
    .from("onsite_requirements")
    .delete()
    .eq("id", requirementId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirement_deleted`);
}

/** Reorder requirements */
async function reorderRequirementsAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") || "");
  const reorderedIds = String(formData.get("reordered_ids") || "").split(",").filter(Boolean);

  if (!moduleId || !reorderedIds.length) throw new Error("Missing fields");

  // First, set all order_index to negative values to avoid constraint violations
  for (let i = 0; i < reorderedIds.length; i++) {
    const { error } = await supabase
      .from("onsite_requirements")
      .update({ order_index: -(i + 1) })
      .eq("id", reorderedIds[i])
      .eq("module_id", moduleId);

    if (error) throw new Error(error.message);
  }

  // Then update to the correct positive values
  for (let i = 0; i < reorderedIds.length; i++) {
    const { error } = await supabase
      .from("onsite_requirements")
      .update({ order_index: i })
      .eq("id", reorderedIds[i])
      .eq("module_id", moduleId);

    if (error) throw new Error(error.message);
  }

  revalidatePath(`/app/creator/modules/${moduleId}/onsite`);
  redirect(`/app/creator/modules/${moduleId}/onsite?ok=requirements_reordered`);
}

// -----------------------------
// Page
// -----------------------------
interface OnsiteModuleSearchParams extends Record<string, string | string[] | undefined> {
  ok?: string | string[] | undefined;
  error?: string | string[] | undefined;
}

export default async function OnsiteModulePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<OnsiteModuleSearchParams>;
}) {
  const params = await props.params;
  const moduleId = params.id;
  const sp: OnsiteModuleSearchParams = await (props.searchParams ?? Promise.resolve({}));
  const ok = firstParam(sp, "ok");
  const errParam = firstParam(sp, "error");

  const { mod, learners, trainerReqs, assessorReqs, nextFor, hasEquipmentModule, err } = await loadData(moduleId);

  if (err || !mod) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold">Onsite Module</h1>
          <p className="text-red-600 mt-2">Error: {err ?? "Module not found"}</p>
          <Link href="/app/creator" className="underline text-sm text-blue-600 hover:text-blue-800 mt-4 inline-block">
            ← Back to Creator
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {mod.type === "onsite_training" ? "Onsite Training Builder" : "Onsite Assessment Builder"}
            </h1>
            <p className="text-gray-600 mt-1">
              Create checklist requirements for trainers and assessors to complete during onsite sessions
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href={`/app/learn/courses/${mod.course_id}?module=${mod.id}&preview=1`}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Test as learner
            </Link>
            <Link
              href={`/app/creator/courses/${mod.course_id}?tab=${mod.type}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back to course
            </Link>
          </div>
        </div>

        {/* Flash banners */}
        {ok && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {ok === "title_saved" && "Module title saved successfully."}
              {ok === "requirement_saved" && "Requirement added successfully."}
              {ok === "requirement_updated" && "Requirement updated successfully."}
              {ok === "requirement_deleted" && "Requirement deleted successfully."}
              {ok === "requirements_reordered" && "Requirements reordered successfully."}
              {ok === "equipment_assessment_updated" && "Equipment assessment setting updated successfully."}
            </div>
          </div>
        )}
        {errParam && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errParam}
            </div>
          </div>
        )}

        {/* Module title section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Module Details</h2>
          <form action={saveTitleAction} className="flex items-center gap-3">
            <input type="hidden" name="module_id" value={mod.id} />
            <div className="flex-1">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Module Title
              </label>
              <input
                id="title"
                name="title"
                defaultValue={mod.title ?? ""}
                placeholder="e.g. Onsite Safety Assessment"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors"
              />
            </div>
            <button className="mt-7 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors">
              Save Title
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">ID: {mod.id}</p>
        </div>

        {/* Equipment Assessment Option - Only show for onsite_assessment modules when equipment modules exist */}
        {mod.type === "onsite_assessment" && hasEquipmentModule && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Equipment Assessment</h2>
            <form action={toggleEquipmentAssessmentAction} className="space-y-4">
              <input type="hidden" name="module_id" value={mod.id} />
              
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="include_equipment"
                    name="include_equipment"
                    type="checkbox"
                    defaultChecked={mod.include_equipment_assessment}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3">
                  <label htmlFor="include_equipment" className="font-medium text-gray-700 cursor-pointer">
                    Include Equipment Assessment
                  </label>
                  <p className="text-sm text-gray-500 mt-1">
                    Allow assessors to review and approve trainee equipment submissions during this assessment.
                  </p>
                </div>
              </div>
              
              <button className="rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 transition-colors">
                Update Setting
              </button>
            </form>
          </div>
        )}

        {/* Main content area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add requirement form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Add New Requirement</h2>
            <form action={addRequirementAction} className="space-y-4">
              <input type="hidden" name="module_id" value={mod.id} />
              <input type="hidden" name="role" value="trainer" />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requirement Label
                </label>
                <input
                  name="label"
                  placeholder="e.g. Safety briefing delivered to learner"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Field Type</label>
                <select name="field_type" defaultValue="checkbox" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors">
                  <option value="checkbox">Checkbox</option>
                  <option value="select">Select</option>
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                  <option value="rating">Rating</option>
                  <option value="file">File Upload</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Options (for Select/Rating fields)
                </label>
                <input
                  name="options"
                  placeholder='e.g. ["Pass","Fail"] or [1,2,3,4,5]'
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  JSON array format. Leave blank for other field types.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Required?</label>
                <select name="required" defaultValue="yes" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors">
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Help Text (optional)
                </label>
                <input
                  name="help_text"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors"
                  placeholder="Additional guidance for the trainer"
                />
              </div>

              <button className="w-full rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700 transition-colors">
                Add Requirement
              </button>
            </form>
          </div>

          {/* Requirements list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Requirements</h2>
            
            <SortableRequirements 
              requirements={trainerReqs}
              moduleId={mod.id}
              updateRequirementAction={updateRequirementAction}
              deleteRequirementAction={deleteRequirementAction}
              reorderRequirementsAction={reorderRequirementsAction}
            />
          </div>
        </div>

        {/* Summary info */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Module Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-600">Enrolled Learners</p>
              <p className="text-2xl font-bold text-gray-900">{learners.length}</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-600">Requirements</p>
              <p className="text-2xl font-bold text-blue-600">{trainerReqs.length}</p>
            </div>
            {mod.type === "onsite_assessment" && hasEquipmentModule && (
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-600">Equipment Assessment</p>
                <p className="text-2xl font-bold text-green-600">
                  {mod.include_equipment_assessment ? "Enabled" : "Disabled"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}