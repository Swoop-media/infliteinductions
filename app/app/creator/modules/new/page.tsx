// app/app/creator/modules/new/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

export default async function NewModulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const resolvedSearchParams = await searchParams;
  const course_id = String(resolvedSearchParams.course_id || "");
  const type = String(resolvedSearchParams.type || "") as ModuleType;
  const title = (resolvedSearchParams.title ? String(resolvedSearchParams.title) : "").trim();

  if (!course_id || !type) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Module Editor</h1>
        <p className="text-red-600">Missing course_id or type.</p>
        <a href="/app/creator" className="underline">Back</a>
      </div>
    );
  }

  // ensure course exists
  const { data: course, error: cErr } = await supabase
    .from("courses")
    .select("id, created_by")
    .eq("id", course_id)
    .single();

  if (cErr || !course) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Module Editor</h1>
        <p className="text-red-600">Course not found.</p>
        <a href="/app/creator" className="underline">Back</a>
      </div>
    );
  }

  // compute next order within the same type
  const { data: maxRow } = await supabase
    .from("course_modules")
    .select("order_index")
    .eq("course_id", course_id)
    .eq("type", type)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const defaultTitle =
    type === "digital_training"
      ? "Training Module"
      : type === "digital_assessment_quiz"
      ? "Digital Quiz"
      : type === "onsite_training"
      ? "Onsite Training"
      : "Onsite Assessment";

  const payload = {
    course_id,
    type,
    title: title || defaultTitle,
    order_index: nextOrder,
    // stage defaults to 'draft', config defaults to '{}' in DB
  };

  const { data: inserted, error } = await supabase
    .from("course_modules")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Module Editor</h1>
        <p className="text-red-600">{error.message}</p>
        <a
          href={`/app/creator/courses/${course_id}?tab=${type}`}
          className="underline"
        >
          Back
        </a>
      </div>
    );
  }

  const moduleId = inserted.id as string;

  // Redirect to the right editor
  if (type === "digital_assessment_quiz") {
    redirect(`/app/creator/modules/${moduleId}/quiz`);
  } else if (type === "digital_training") {
    redirect(`/app/creator/modules/${moduleId}`);
  } else {
    redirect(`/app/creator/courses/${course_id}?tab=${type}`);
  }
}
