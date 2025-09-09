"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ModuleType } from "@/lib/types/module";

function tabForType(t: ModuleType) {
  return t; // your tabs match the type names for onsite_*; adjust if needed for others
}

export function moduleEditHref(type: ModuleType, id: string): string {
  if (type === "onsite_training" || type === "onsite_assessment") return `/app/creator/modules/${id}/onsite`;
  if (type === "digital_assessment_quiz") return `/app/creator/modules/${id}/quiz`;
  return `/app/creator/modules/${id}`; // default editor
}

export async function moveModuleAction(formData: FormData) {
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const type = String(formData.get("type") ?? "") as ModuleType;
  const direction = String(formData.get("direction") ?? "up"); // "up" | "down"
  if (!moduleId || !courseId || !type) throw new Error("Missing fields");

  const { data: mod, error: mErr } = await supabase
    .from("course_modules")
    .select('id, course_id, type, "order"')
    .eq("id", moduleId)
    .maybeSingle();
  if (mErr || !mod) throw new Error(mErr?.message || "Module not found");

  const curOrder = (mod as any).order ?? 0;

  // Find neighbor
  let neighbor: { id: string; order: number } | null = null;
  if (direction === "up") {
    const { data } = await supabase
      .from("course_modules")
      .select('id, "order"')
      .eq("course_id", courseId)
      .eq("type", type)
      .lt("order", curOrder)
      .order("order", { ascending: false })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  } else {
    const { data } = await supabase
      .from("course_modules")
      .select('id, "order"')
      .eq("course_id", courseId)
      .eq("type", type)
      .gt("order", curOrder)
      .order("order", { ascending: true })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  }

  if (!neighbor) {
    revalidatePath(`/app/creator/courses/${courseId}?tab=${tabForType(type)}`);
    return;
  }

  // Swap orders
  const { error: e1 } = await supabase
    .from("course_modules")
    .update({ order: (neighbor as any).order })
    .eq("id", mod.id);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from("course_modules")
    .update({ order: curOrder })
    .eq("id", (neighbor as any).id);
  if (e2) throw new Error(e2.message);

  revalidatePath(`/app/creator/courses/${courseId}?tab=${tabForType(type)}`);
}

export async function deleteModuleAction(formData: FormData) {
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const type = String(formData.get("type") ?? "") as ModuleType;
  if (!moduleId || !courseId || !type) throw new Error("Missing fields");

  const { error } = await supabase.from("course_modules").delete().eq("id", moduleId);
  if (error) throw new Error(error.message);

  // Renumber remaining of same type (0..N-1)
  const { data: rest } = await supabase
    .from("course_modules")
    .select('id, "order"')
    .eq("course_id", courseId)
    .eq("type", type)
    .order("order", { ascending: true });

  if (rest && rest.length) {
    for (let i = 0; i < rest.length; i++) {
      const r = rest[i] as any;
      if (r.order !== i) {
        await supabase.from("course_modules").update({ order: i }).eq("id", r.id);
      }
    }
  }

  revalidatePath(`/app/creator/courses/${courseId}?tab=${tabForType(type)}`);
}
