import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

async function loadCourse(id: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const can =
    (await hasRole("Admin")) ||
    (await hasRole("Course Creators")) ||
    (await hasRole("Creator"));
  if (!can) redirect("/app/home");

  const { data, error } = await supabase
    .from("courses")
    .select("id, title, status, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { course: null, err: error?.message ?? "Course not found" };
  }
  return { course: data, err: null as string | null };
}

export default async function ConfirmDeletePage({
  params,
}: {
  params: { id: string };
}) {
  const { course, err } = await loadCourse(params.id);

  if (err || !course) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Delete course</h1>
        <p className="text-red-600">Error: {err ?? "Course not found"}</p>
        <Link href="/app/creator" className="underline text-sm">
          ← Back to Creator
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Delete course</h1>
        <Link href="/app/creator" className="rounded-md border px-3 py-1 text-sm">
          Back
        </Link>
      </div>

      <div className="rounded-xl border p-4 space-y-4 bg-white">
        <div className="space-y-1">
          <div className="text-sm text-gray-500">Course</div>
          <div className="text-lg font-semibold">{course.title ?? course.id}</div>
          {course.status ? (
            <div className="text-xs text-gray-500">Status: {course.status}</div>
          ) : null}
        </div>

        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Are you sure you want to delete this course?</div>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>This action is permanent.</li>
            <li>
              If the course has related data (modules, enrolments, assignments, etc.),
              deletion may fail unless your DB has cascading deletes. If it fails, set the
              course status to <strong>archived</strong> instead.
            </li>
          </ul>
        </div>

        {/* IMPORTANT: post to /delete/perform now */}
        <form
          action={`/app/creator/courses/${course.id}/delete/perform`}
          method="post"
          className="flex items-center gap-2"
        >
          <button
            className="rounded-md border px-3 py-2 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
          >
            Yes, delete course
          </button>
          <Link href="/app/creator" className="rounded-md border px-3 py-2 text-sm">
            Cancel
          </Link>
        </form>
      </div>
    </div>
  );
}
