import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";

type Enrol = { id: string; user_id: string; course_id: string; status: string; created_at: string };
type Profile = { id: string; full_name: string | null; email: string | null };
type Course = { id: string; title: string | null };

async function fetchData() {
  const supabase = createSupabaseServer();

  // 1) enrolments (RLS: learner sees own; Admin/Trainers see all)
  const { data: enrolments, error: eErr } = await supabase
    .from("course_enrolments")
    .select("id, user_id, course_id, status, created_at")
    .order("created_at", { ascending: true })
    .limit(200);

  if (eErr) return { enrolments: [], profiles: [], courses: [], error: eErr.message };

  const userIds = Array.from(new Set((enrolments ?? []).map((e) => e.user_id)));
  const courseIds = Array.from(new Set((enrolments ?? []).map((e) => e.course_id)));

  // 2) profiles (RLS: Admin/Trainers can see all, users see own)
  let profiles: Profile[] = [];
  if (userIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (error) return { enrolments, profiles: [], courses: [], error: error.message };
    profiles = data ?? [];
  }

  // 3) courses (RLS: authenticated can select all)
  let courses: Course[] = [];
  if (courseIds.length) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title")
      .in("id", courseIds);
    if (error) return { enrolments, profiles, courses: [], error: error.message };
    courses = data ?? [];
  }

  return { enrolments: enrolments ?? [], profiles, courses, error: null as string | null };
}

export default async function AdminPage() {
  const allowed =
    (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home");

  const { enrolments, profiles, courses, error } = await fetchData();

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const pending = enrolments.filter((e) => e.status === "pending");
  const nonPending = enrolments.filter((e) => e.status !== "pending");

  const badge = (status: string) => {
    const cls =
      status === "approved"
        ? "bg-green-100 text-green-700"
        : status === "pending"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-gray-100 text-gray-700";
    return (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Admin: Enrolments</h1>

      {error && (
        <pre className="rounded-md border bg-red-50 p-3 text-xs text-red-700">
          {error}
        </pre>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Pending approvals</h2>
        {pending.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
            No pending enrolments.
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((enrol) => {
              const u = profileById.get(enrol.user_id);
              const c = courseById.get(enrol.course_id);
              return (
                <li
                  key={enrol.id}
                  className="flex items-center justify-between rounded-md border bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c?.title ?? "Course"}</div>
                    <div className="text-xs text-gray-500 truncate">
                      Requested by {u?.full_name ?? "User"} ({u?.email ?? "n/a"})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {badge(enrol.status)}
                    <form action="/app/admin/approve" method="post">
                      <input type="hidden" name="enrolment_id" value={enrol.id} />
                      <button className="rounded-md bg-green-600 px-3 py-1 text-sm text-white">
                        Approve
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Recent decisions</h2>
        {nonPending.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
            Nothing here yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {nonPending.map((enrol) => {
              const u = profileById.get(enrol.user_id);
              const c = courseById.get(enrol.course_id);
              return (
                <li
                  key={enrol.id}
                  className="flex items-center justify-between rounded-md border bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c?.title ?? "Course"}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {u?.full_name ?? "User"} ({u?.email ?? "n/a"})
                    </div>
                  </div>
                  <div>{badge(enrol.status)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
