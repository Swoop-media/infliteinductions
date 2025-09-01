
// app/app/learn/courses/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import CoursePreview from "@/components/CoursePreview";

/**
 * Renders a course as a learner (assignments-only approach).
 * Requires a trainee assignment for the signed-in user.
 */
type RouteParams = { id: string };

export default async function LearnerCoursePage(props: { params: Promise<RouteParams> }) {
  const { id: courseId } = await props.params;
  const supabase = await createSupabaseServer();

  // Require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/login");

  // Must have a trainee assignment for this course
  const { data: assignment, error: assignmentErr } = await supabase
    .from("course_assignments")
    .select("id, role, assignment_status")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .eq("role", "trainee")
    .single();

  if (assignmentErr || !assignment) {
    console.error("No trainee assignment", assignmentErr);
    redirect("/app/learn?error=not_assigned");
  }

  // Load course
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, description, status")
    .eq("id", courseId)
    .single();
  if (courseErr || !course) {
    console.error("Course load error", courseErr);
    notFound();
  }

  // Load modules + blocks
  const { data: modules, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, title, type, order_index, stage")
    .eq("course_id", course.id)
    .order("order_index", { ascending: true });
  if (modErr) {
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
    console.error("Blocks load error", blockErr);
    notFound();
  }

  // Load assignment progress
  const { data: assignmentProgress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignment.id);

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <CoursePreview
        courseId={course.id}
        courseTitle={course.title}
        courseDescription={course.description ?? ""}
        modules={modules ?? []}
        blocks={blocks ?? []}
        mode="learner"
        assignmentId={assignment.id}
        assignmentProgress={assignmentProgress ?? []}
      />
    </div>
  );
}
