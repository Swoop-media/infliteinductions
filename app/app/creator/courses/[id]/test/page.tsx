// @ts-nocheck
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import CoursePreview from "@/components/CoursePreview";

type RouteParams = { id: string };

export default async function TestCoursePage(props: { params: Promise<RouteParams> }) {
  const { id } = await props.params;
  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/login");

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, status, created_by")
    .eq("id", id)
    .single();
  if (courseErr || !course) {
    // eslint-disable-next-line no-console
    console.error("Course load error", courseErr);
    notFound();
  }

  const { data: modules, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, title, type, order_index, stage")
    .eq("course_id", course.id)
    .order("order_index", { ascending: true });
  if (modErr) {
    // eslint-disable-next-line no-console
    console.error("Modules load error", modErr);
    notFound();
  }

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: blocks, error: blockErr } = moduleIds.length
    ? await supabase
        .from("module_content_blocks")
        .select("id, module_id, kind, data, order_index")
        .in("module_id", moduleIds)
        .order("order_index", { ascending: true })
    : { data: [], error: null as any };
  if (blockErr) {
    // eslint-disable-next-line no-console
    console.error("Blocks load error", blockErr);
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <CoursePreview
        courseId={course.id}
        courseTitle={course.title}
        courseDescription={""}
        modules={modules ?? []}
        blocks={blocks ?? []}
        mode="preview"  // no persistence in preview
      />
    </div>
  );
}