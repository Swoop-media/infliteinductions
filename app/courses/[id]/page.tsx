// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MODULE_TYPE_LABELS: Record<string, string> = {
  digital_training: "Digital Training",
  digital_assessment_quiz: "Digital Assessment (Quiz)",
  onsite_training: "Onsite Training",
  onsite_assessment: "Onsite Assessment",
};

function statusBadgeClasses(status: string | null) {
  switch (status) {
    case "published":
      return "bg-green-100 text-green-700";
    case "archived":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export default async function CoursePreviewPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = await props.params;
  const supabase = supabaseAdmin();

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, description, status, department, valid_for_days")
    .eq("id", courseId)
    .eq("status", "published")
    .maybeSingle();

  if (!course) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900">Course not found</h1>
        <p className="mt-2 text-gray-600">
          This course preview is unavailable or the link is no longer valid.
        </p>
      </main>
    );
  }

  const { data: modules } = await supabase
    .from("course_modules")
    .select("id, title, type, order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  const moduleList = modules ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        Course Preview
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-gray-900">{course.title || "Untitled Course"}</h1>
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${statusBadgeClasses(course.status)}`}
        >
          {course.status}
        </span>
      </div>

      {course.description && (
        <p className="mt-4 whitespace-pre-line text-gray-700">{course.description}</p>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-gray-400">Department</dt>
          <dd className="mt-1 text-sm text-gray-900">{course.department || "—"}</dd>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-gray-400">Validity</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {course.valid_for_days
              ? `${course.valid_for_days} days`
              : "No expiry"}
          </dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Course content</h2>
        {moduleList.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No modules have been added to this course yet.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {moduleList.map((m, i) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-lg border bg-white p-3"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="font-medium text-gray-900">{m.title || "Untitled module"}</span>
                  <span className="ml-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {MODULE_TYPE_LABELS[m.type] || m.type}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
