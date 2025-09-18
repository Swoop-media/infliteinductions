// @ts-nocheck
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type EquipmentTemplate = {
  id: string;
  course_id: string;
  equipment_name: string;
  description: string | null;
  required: boolean;
  category: string | null;
  specifications: any;
  order_index: number;
  created_at: string;
};

type ModuleRow = {
  id: string;
  course_id: string;
  type: string;
  title: string | null;
};

/** Loaders */
async function loadModuleAndEquipment(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) redirect("/app/home?banner=not_authorised");

  // Load module
  const { data: mod, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title")
    .eq("id", moduleId)
    .maybeSingle();

  if (modErr || !mod) throw new Error(modErr?.message || "Module not found");

  // Load equipment templates for this course
  const { data: equipment, error: eqErr } = await supabase
    .from("equipment_templates")
    .select("*")
    .eq("course_id", mod.course_id)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (eqErr) throw new Error(eqErr.message);

  return {
    module: mod as ModuleRow,
    equipment: (equipment ?? []) as EquipmentTemplate[]
  };
}

/** Actions */
async function createEquipmentTemplate(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const courseId = String(formData.get("course_id") || "");
  const equipmentName = String(formData.get("equipment_name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const category = String(formData.get("category") || "").trim() || null;
  const required = formData.get("required") === "on";

  if (!moduleId || !courseId || !equipmentName) {
    throw new Error("Missing required fields");
  }

  // Get next order index
  const { data: maxRow } = await supabase
    .from("equipment_templates")
    .select("order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((maxRow?.order_index ?? -1) as number) + 1;

  const { error } = await supabase
    .from("equipment_templates")
    .insert({
      course_id: courseId,
      equipment_name: equipmentName,
      description: description,
      required: required,
      category: category,
      specifications: {},
      order_index: nextOrder,
      created_by: (await supabase.auth.getUser()).data.user?.id
    });

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/equipment`);
  redirect(`/app/creator/modules/${moduleId}/equipment?notice=equipment_created`);
}

async function deleteEquipmentTemplate(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const equipmentId = String(formData.get("equipment_id") || "");

  if (!moduleId || !equipmentId) throw new Error("Missing fields");

  const { error } = await supabase
    .from("equipment_templates")
    .delete()
    .eq("id", equipmentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/equipment`);
  redirect(`/app/creator/modules/${moduleId}/equipment?notice=equipment_deleted`);
}

async function updateEquipmentTemplate(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const equipmentId = String(formData.get("equipment_id") || "");
  const equipmentName = String(formData.get("equipment_name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const category = String(formData.get("category") || "").trim() || null;
  const required = formData.get("required") === "on";

  if (!moduleId || !equipmentId || !equipmentName) {
    throw new Error("Missing required fields");
  }

  const { error } = await supabase
    .from("equipment_templates")
    .update({
      equipment_name: equipmentName,
      description: description,
      required: required,
      category: category
    })
    .eq("id", equipmentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/app/creator/modules/${moduleId}/equipment`);
  redirect(`/app/creator/modules/${moduleId}/equipment?notice=equipment_updated`);
}

/** Main Component */
export default async function EquipmentManagementPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { module, equipment } = await loadModuleAndEquipment(resolvedParams.id);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Form Requirements</h1>
          <div className="text-xs text-gray-500">
            Module: {module.title} • Course Form Management
          </div>
        </div>
        <Link 
          href={`/app/creator/modules/${module.id}`} 
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
        >
          Back to Module
        </Link>
      </div>

      {/* Notice */}
      {resolvedSearchParams.notice && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-800">
            {resolvedSearchParams.notice === "equipment_created" && "Form requirement created successfully"}
            {resolvedSearchParams.notice === "equipment_updated" && "Form requirement updated successfully"}
            {resolvedSearchParams.notice === "equipment_deleted" && "Form requirement deleted successfully"}
          </p>
        </div>
      )}

      {/* Add New Equipment */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Add Form Requirement</h2>
        <form action={createEquipmentTemplate} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="module_id" value={module.id} />
          <input type="hidden" name="course_id" value={module.course_id} />
          
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Form Name *</span>
            <input
              name="equipment_name"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              placeholder="e.g., Hard Hat, Safety Glasses, Multimeter"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-gray-700">Category</span>
            <select 
              name="category" 
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
            >
              <option value="">Select category</option>
              <option value="PPE">Personal Protective Equipment</option>
              <option value="Tools">Tools</option>
              <option value="Machinery">Machinery</option>
              <option value="Instruments">Measuring Instruments</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="required"
              defaultChecked={true}
              className="rounded border-gray-300"
            />
            <span className="font-medium text-gray-700">Required Form</span>
          </label>

          <label className="grid gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <textarea
              name="description"
              rows={3}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              placeholder="Provide details about specifications, requirements, or usage..."
            />
          </label>

          <div className="sm:col-span-2">
            <button 
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Form Requirement
            </button>
          </div>
        </form>
      </div>

      {/* Equipment List */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Current Form Requirements</h2>
        
        {equipment.length === 0 ? (
          <p className="text-sm text-gray-500">
            No form requirements configured yet. Add one above to get started.
          </p>
        ) : (
          <div className="space-y-4">
            {equipment.map((eq) => (
              <div key={eq.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-gray-900">{eq.equipment_name}</h3>
                      {eq.required && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Required</span>
                      )}
                      {eq.category && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{eq.category}</span>
                      )}
                    </div>
                    {eq.description && (
                      <p className="text-sm text-gray-600 mb-2">{eq.description}</p>
                    )}
                    <p className="text-xs text-gray-500">Order: {eq.order_index}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Edit form - simplified for now */}
                    <form action={deleteEquipmentTemplate} style={{display: 'inline'}}>
                      <input type="hidden" name="module_id" value={module.id} />
                      <input type="hidden" name="equipment_id" value={eq.id} />
                      <button 
                        type="submit"
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}