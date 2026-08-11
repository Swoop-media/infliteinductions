// @ts-nocheck
// app/app/admin/tools/unpublished-assignments/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { hasRole } from "@/lib/roles";
import { createSupabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function UnpublishedAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const resolved = (await searchParams) || {};
  const ok = Array.isArray(resolved.ok) ? resolved.ok[0] : resolved.ok;
  const error = Array.isArray(resolved.error) ? resolved.error[0] : resolved.error;

  const supabase = createSupabaseService();

  // Find all courses that are not published
  const { data: unpublishedCourses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title, status")
    .neq("status", "published");

  const courseIds = (unpublishedCourses || []).map((c) => c.id);
  const courseById = new Map((unpublishedCourses || []).map((c) => [c.id, c]));

  // Learner (trainee) assignments pointing at those courses
  let assignments: any[] = [];
  let assignmentsError: any = null;
  if (courseIds.length > 0) {
    // Chunk .in() lists to stay under URL limits
    const chunks: string[][] = [];
    for (let i = 0; i < courseIds.length; i += 100) chunks.push(courseIds.slice(i, i + 100));
    for (const chunk of chunks) {
      const { data, error: err } = await supabase
        .from("course_assignments")
        .select("id, user_id, course_id, role, assignment_status, assigned_at")
        .eq("role", "trainee")
        .in("course_id", chunk);
      if (err) {
        assignmentsError = err;
        break;
      }
      assignments = assignments.concat(data || []);
    }
  }

  // Load profiles for the affected users
  const userIds = Array.from(new Set(assignments.map((a) => a.user_id)));
  const profileById = new Map();
  if (userIds.length > 0) {
    for (let i = 0; i < userIds.length; i += 100) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds.slice(i, i + 100));
      for (const p of profs || []) profileById.set(p.id, p);
    }
  }

  const rows = assignments
    .map((a) => ({
      ...a,
      course: courseById.get(a.course_id),
      profile: profileById.get(a.user_id),
    }))
    .sort((a, b) =>
      (a.course?.title || "").localeCompare(b.course?.title || "") ||
      (a.profile?.full_name || "").localeCompare(b.profile?.full_name || "")
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools · Unpublished course assignments</h1>
          <p className="text-sm text-gray-600 max-w-3xl">
            Learners assigned to courses that are not published (draft or archived). Draft-course
            content is hidden from learners, so these assignments appear broken to them (e.g. quizzes
            that won&apos;t load). Either publish the course, or remove the assignment below.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      {ok === "removed" && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          Assignment removed.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {(coursesError || assignmentsError) && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          Failed to load data: {coursesError?.message || assignmentsError?.message}
        </div>
      )}

      {rows.length === 0 && !coursesError && !assignmentsError ? (
        <div className="rounded-md border bg-white px-4 py-6 text-sm text-gray-600">
          No learner assignments on unpublished courses. All clear.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Learner</th>
                <th className="px-4 py-2">Course</th>
                <th className="px-4 py-2">Course status</th>
                <th className="px-4 py-2">Assignment status</th>
                <th className="px-4 py-2">Assigned</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/app/admin/users/${r.user_id}`} className="text-blue-700 hover:underline">
                      {r.profile?.full_name || r.profile?.email || r.user_id}
                    </Link>
                    {r.profile?.email && (
                      <div className="text-xs text-gray-500">{r.profile.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{r.course?.title || r.course_id}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {r.course?.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.assignment_status}</td>
                  <td className="px-4 py-2">
                    {r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action="/app/admin/tools/unpublished-assignments/remove" method="POST">
                      <input type="hidden" name="assignment_id" value={r.id} />
                      <input type="hidden" name="user_id" value={r.user_id} />
                      <input type="hidden" name="course_id" value={r.course_id} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Remove assignment
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
