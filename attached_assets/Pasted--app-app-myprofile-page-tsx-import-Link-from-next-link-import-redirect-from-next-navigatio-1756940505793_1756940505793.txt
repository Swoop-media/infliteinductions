// app/app/myprofile/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/* ---------------- Types ---------------- */
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  job_description?: string | null;
};

type EnrolRow = {
  course_id: string;
  status: string;
  updated_at?: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  status?: "draft" | "published" | "archived";
  updated_at?: string | null;
};

/* ------------- Data loader ------------- */
async function loadMyProfileAndLearning() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login");

  // Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", user.id)
    .maybeSingle();

  // Enrolments (we'll categorize client-side)
  const { data: enrols = [] } = await supabase
    .from("course_enrolments")
    .select("course_id, status, updated_at")
    .eq("user_id", user.id);

  const courseIds = Array.from(new Set(enrols.map((e) => e.course_id)));
  let courses: CourseRow[] = [];
  if (courseIds.length) {
    const { data } = await supabase
      .from("courses")
      .select("id, title, status, updated_at")
      .in("id", courseIds);
    courses = (data ?? []) as CourseRow[];
  }

  const courseMap = new Map<string, CourseRow>();
  courses.forEach((c) => courseMap.set(c.id, c));

  // Categorize
  const inProgress: Array<{ course: CourseRow; status: string }> = [];
  const completed: Array<{ course: CourseRow; status: string }> = [];

  for (const e of enrols as EnrolRow[]) {
    const c = courseMap.get(e.course_id);
    if (!c) continue;
    const s = (e.status || "").toLowerCase();

    if (s === "approved" || s === "in_progress") {
      inProgress.push({ course: c, status: s });
    } else if (s === "completed") {
      completed.push({ course: c, status: s });
    }
    // ignore: pending, rejected, cancelled, etc.
  }

  // Sort by most recently updated course first
  const byUpdatedDesc = (a: { course: CourseRow }, b: { course: CourseRow }) => {
    const ta = new Date(a.course.updated_at ?? 0).getTime();
    const tb = new Date(b.course.updated_at ?? 0).getTime();
    return tb - ta;
  };
  inProgress.sort(byUpdatedDesc);
  completed.sort(byUpdatedDesc);

  return { profile, inProgress, completed };
}

/* ---------------- UI helpers ---------------- */
function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "blue" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ---------------- Page ---------------- */
export default async function MyProfilePage() {
  const { profile, inProgress, completed } = await loadMyProfileAndLearning();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My profile</h1>
          {profile ? (
            <p className="text-sm text-gray-600">
              {profile.full_name ?? ""} {profile.email ? `• ${profile.email}` : ""}
              {profile.department ? ` • ${profile.department}` : ""}
              {profile.job_description ? ` • ${profile.job_description}` : ""}
            </p>
          ) : (
            <p className="text-sm text-gray-600">No profile details.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/myprofile/documents"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            My documents
          </Link>
          <Link
            href="/app/courses"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Browse courses
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/myprofile/documents"
          className="rounded-xl border bg-white p-4 hover:bg-gray-50"
        >
          <div className="text-lg font-semibold">My documents</div>
          <p className="mt-1 text-sm text-gray-600">
            View and download documents you’ve uploaded (e.g., licence, medical).
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-sm underline">
            Open documents →
          </div>
        </Link>

        {/* Placeholder for future settings or certificates list */}
        <div className="rounded-xl border bg-white p-4">
          <div className="text-lg font-semibold">Profile settings</div>
          <p className="mt-1 text-sm text-gray-600">Coming soon: update personal details.</p>
        </div>
      </section>

      {/* My learning */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* In progress */}
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">In progress</h2>
            <Pill tone="blue">{inProgress.length}</Pill>
          </div>

          {inProgress.length === 0 ? (
            <p className="text-sm text-gray-500">
              You don’t have any approved courses yet. Visit{" "}
              <Link href="/app/courses" className="underline">
                Courses
              </Link>{" "}
              to enrol.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {inProgress.map(({ course, status }) => (
                <li key={course.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{course.title ?? "Untitled"}</div>
                    <div className="text-xs text-gray-500">
                      Updated {new Date(course.updated_at ?? Date.now()).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={status === "approved" ? "gray" : "blue"}>
                      {status === "approved" ? "Approved" : "In progress"}
                    </Pill>
                    <Link
                      href={`/app/learn/courses/${course.id}`}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Continue
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Completed */}
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Completed</h2>
            <Pill tone="green">{completed.length}</Pill>
          </div>

          {completed.length === 0 ? (
            <p className="text-sm text-gray-500">No completions yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {completed.map(({ course }) => (
                <li key={course.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{course.title ?? "Untitled"}</div>
                    <div className="text-xs text-gray-500">
                      Updated {new Date(course.updated_at ?? Date.now()).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone="green">Completed</Pill>
                    <Link
                      href={`/app/learn/courses/${course.id}`}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
