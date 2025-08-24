// app/app/home/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Types */
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
  tags?: string[] | null;
  department?: string | null;
};

type ReleaseNote = {
  id: string;
  title: string | null;
  body: string | null;
  created_at: string | null;
};

/** Loader */
async function loadHomeData() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) redirect("/auth/login");
  const userId = auth.user.id;

  // Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", userId)
    .maybeSingle();

  // Enrolments
  const { data: enrols = [] } = await supabase
    .from("course_enrolments")
    .select("course_id, status, updated_at")
    .eq("user_id", userId);

  // Fetch details for those course ids
  const courseIds = Array.from(new Set((enrols ?? []).map((e) => e.course_id)));
  let courses: CourseRow[] = [];
  if (courseIds.length) {
    const { data } = await supabase
      .from("courses")
      .select("id, title, status, updated_at, tags, department")
      .in("id", courseIds);
    courses = (data ?? []) as CourseRow[];
  }
  const courseMap = new Map<string, CourseRow>();
  courses.forEach((c) => courseMap.set(c.id, c));

  // Categorize by status
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
  }

  // Sort newest first
  const byUpdatedDesc = (a: { course: CourseRow }, b: { course: CourseRow }) =>
    new Date(b.course.updated_at ?? 0).getTime() - new Date(a.course.updated_at ?? 0).getTime();
  inProgress.sort(byUpdatedDesc);
  completed.sort(byUpdatedDesc);

  // Browse preview (safe try/catch)
  let browsePreview: CourseRow[] = [];
  try {
    const { data } = await supabase
      .from("courses")
      .select("id, title, status, updated_at, tags, department")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(6);
    browsePreview = (data ?? []) as CourseRow[];
  } catch {
    // ignore if table differs
  }

  // Release notes (optional)
  let notes: ReleaseNote[] = [];
  try {
    const { data } = await supabase
      .from("release_notes")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    notes = (data ?? []) as ReleaseNote[];
  } catch {
    // ignore if table doesn’t exist
  }

  return { profile: (profile ?? null) as Profile | null, inProgress, completed, browsePreview, notes };
}

/** Banner helpers */
function OkErrorBanner({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {ok === "profile_saved"
          ? "Profile saved."
          : ok === "enrolment_approved"
          ? "Enrolment approved."
          : ok === "enrolment_revoked"
          ? "Enrolment revoked."
          : "Done."}
      </div>
    );
  }
  return null;
}

function SoftBanner({ code }: { code?: string | null }) {
  if (!code) return null;

  const normalized = (code || "").toLowerCase();
  let msg: string | null = null;

  switch (normalized) {
    case "no_access":
    case "not_authorised":
    case "not_authorized":
      msg = "Sorry, you don’t have access to that area.";
      break;
    case "logout":
      msg = "You have been signed out.";
      break;
    case "enrolment_not_approved":
      msg = "Your enrolment hasn’t been approved yet.";
      break;
    default:
      msg = null;
  }

  if (!msg) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {msg}
    </div>
  );
}

/** Small UI helpers */
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

/** Page */
export default async function HomePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const ok = (Array.isArray(sp.ok) ? sp.ok[0] : sp.ok) ?? null;
  const error = (Array.isArray(sp.error) ? sp.error[0] : sp.error) ?? null;
  const bannerCode = (Array.isArray(sp.banner) ? sp.banner[0] : sp.banner) ?? null;

  const { profile, inProgress, completed, browsePreview, notes } = await loadHomeData();

  return (
    <div className="space-y-8">
      {/* Banners (error/ok has priority, then soft banner code) */}
      {OkErrorBanner({ ok, error })}
      {!error && !ok ? <SoftBanner code={bannerCode} /> : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          {profile?.email && <p className="text-sm text-gray-600">{profile.email}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/app/myprofile" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            My profile
          </Link>
          <Link href="/app/courses" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            Browse courses
          </Link>
        </div>
      </div>

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

      {/* Browse teaser */}
      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Courses & authorisations</h2>
          <Link href="/app/courses" className="text-sm underline">
            See all
          </Link>
        </div>

        {browsePreview.length === 0 ? (
          <p className="text-sm text-gray-500">No published courses yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {browsePreview.map((c) => (
              <li key={c.id} className="rounded-lg border p-3">
                <div className="font-medium">{c.title ?? "Untitled"}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {c.department || "—"}
                  {Array.isArray(c.tags) && c.tags.length > 0 ? ` • ${c.tags.slice(0, 2).join(", ")}` : ""}
                </div>
                <div className="mt-2">
                  <Link
                    href="/app/courses"
                    className="text-xs underline"
                    title="Go to courses catalogue"
                  >
                    Enrol from catalogue →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Release notes (optional, shown if table exists) */}
      {notes.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Release notes</h2>
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border p-3">
                <div className="font-medium">{n.title ?? "Update"}</div>
                <div className="text-xs text-gray-500">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </div>
                {n.body && <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
