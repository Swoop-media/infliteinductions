// app/app/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import SendExpiryRemindersButton from "./_components/SendExpiryRemindersButton";
import SortableDueDatesTable from "./_components/SortableDueDatesTable";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// Sort icon helper function
function getSortIcon(column: string, sortField: string | null, sortDirection: 'asc' | 'desc') {
  if (sortField !== column) {
    return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
  }
  return sortDirection === 'asc' 
    ? <ChevronUp className="h-4 w-4 text-blue-600" />
    : <ChevronDown className="h-4 w-4 text-blue-600" />;
}

export const dynamic = "force-dynamic";

type TabKey = "due_dates" | "users";

function tabFromSearch(sp: Record<string, string | string[] | undefined>): TabKey {
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab || "";
  return raw === "users" ? "users" : "due_dates";
}

function banner(ok?: string | null, error?: string | null) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    const msg =
      ok === "role_granted" ? "Role granted." :
      ok === "role_revoked" ? "Role revoked." :
      ok === "profile_saved" ? "Profile saved." :
      "Done.";
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {msg}
      </div>
    );
  }
  return null;
}



/* --------------------------
   DUE DATES
---------------------------*/
type CompletedCourseRow = {
  assignment_id: string;
  user_id: string;
  course_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
  course_title: string | null;
  valid_for_days: number | null;
  created_by: string | null;
};

async function loadCompletedCoursesWithDueDates(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  // First get the completed course assignments
  const { data: assignments, error: assignError } = await supabase
    .from("course_assignments")
    .select("id, user_id, course_id, completed_at")
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(100);

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Get unique user and course IDs
  const userIds = [...new Set(assignments.map(a => a.user_id))];
  const courseIds = [...new Set(assignments.map(a => a.course_id))];

  // Get profiles
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profileError) throw new Error(profileError.message);

  // Get courses
  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .select("id, title, valid_for_days, created_by")
    .in("id", courseIds);

  if (courseError) throw new Error(courseError.message);

  // Create lookup maps
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const courseMap = new Map((courses || []).map(c => [c.id, c]));

  // Combine data and apply search filter
  let completedCourses: CompletedCourseRow[] = assignments.map((assignment) => {
    const profile = profileMap.get(assignment.user_id);
    const course = courseMap.get(assignment.course_id);

    return {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      course_id: assignment.course_id,
      completed_at: assignment.completed_at,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      course_title: course?.title ?? null,
      valid_for_days: course?.valid_for_days ?? null,
      created_by: course?.created_by ?? null,
    };
  });

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    completedCourses = completedCourses.filter(course =>
      (course.full_name?.toLowerCase().includes(searchTerm)) ||
      (course.email?.toLowerCase().includes(searchTerm)) ||
      (course.course_title?.toLowerCase().includes(searchTerm))
    );
  }

  return completedCourses;
}

/* --------------------------
   USERS + ROLES
---------------------------*/
type Profile = { id: string; full_name: string | null; email: string | null; department?: string | null; job_description?: string | null };
type RoleCatalogItem = { id: string; name: string; description?: string | null };

async function loadRoleCatalog() {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, description: (r as any).description ?? null }));
  return items as RoleCatalogItem[];
}

async function loadUsersAndRoles(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home?banner=no_access");

  // Profiles
  let profs: Profile[] = [];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, job_description")
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .order("full_name", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    profs = (data ?? []) as Profile[];
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, job_description")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    profs = (data ?? []) as Profile[];
  }

  // Role catalog + user_roles
  const catalog = await loadRoleCatalog();
  const ids = profs.map(p => p.id);

  const roleIdToName = new Map<string, string>();
  catalog.forEach(r => roleIdToName.set(r.id, r.name));

  const { data: ur, error: urErr } = await supabase
    .from("user_roles")
    .select("user_id, role_id")
    .in("user_id", ids);
  if (urErr) throw new Error(urErr.message);

  const roleMap = new Map<string, string[]>();
  (ur ?? []).forEach((row: any) => {
    const rn = roleIdToName.get(row.role_id) ?? `(unknown: ${row.role_id})`;
    const list = roleMap.get(row.user_id) ?? [];
    if (!list.includes(rn)) list.push(rn);
    roleMap.set(row.user_id, list);
  });

  // Offer curated set if present; otherwise fall back to all roles
  const preferred = ["Admin", "Trainers and Assessors", "Course Creators", "Senior Management"];
  const namesInCatalog = new Set(catalog.map(c => c.name));
  const offeredNames = preferred.filter(n => namesInCatalog.has(n));
  const grantablePool = offeredNames.length ? offeredNames : Array.from(namesInCatalog);

  return { profiles: profs, roleMap, grantablePool };
}

/* --------------------------
   PAGE
---------------------------*/
export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const resolvedSearchParams = await searchParams;
  const tab = tabFromSearch(resolvedSearchParams ?? {});
  const ok =
    (Array.isArray(resolvedSearchParams?.ok) ? resolvedSearchParams?.ok[0] : resolvedSearchParams?.ok) ?? null;
  const error =
    (Array.isArray(resolvedSearchParams?.error) ? resolvedSearchParams?.error[0] : resolvedSearchParams?.error) ?? null;

  const q =
    (Array.isArray(resolvedSearchParams?.q) ? resolvedSearchParams?.q[0] : resolvedSearchParams?.q) ?? null;

  const tabs: { key: TabKey; label: string; href: string }[] = [
    { key: "due_dates", label: "Due Dates", href: "/app/admin?tab=due_dates" },
    { key: "users", label: "Users & Roles", href: "/app/admin?tab=users" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          <Link href="/app/courses" className="rounded-md border px-3 py-1 text-sm">Courses</Link>
          <Link href="/app/admin/authorisations" className="rounded-md border px-3 py-1 text-sm">Authorisation Due Dates</Link>
          <SendExpiryRemindersButton />
        </div>
      </div>

      {banner(ok, error)}

      <div className="flex gap-2">
        {tabs.map(t => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={[
                "rounded-md px-3 py-1 text-sm",
                active ? "bg-black text-white" : "border hover:bg-gray-50",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white p-4">
        {tab === "due_dates" ? (
          <DueDatesSection q={q} />
        ) : (
          <UsersSection q={q} />
        )}
      </div>
    </div>
  );
}

/* --------------------------
   SUBSECTIONS
---------------------------*/

async function DueDatesSection({ q }: { q: string | null }) {
  const completedCourses = await loadCompletedCoursesWithDueDates(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Course Due Dates</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="due_dates" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, course, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      <SortableDueDatesTable completedCourses={completedCourses} />
    </div>
  );
}

async function UsersSection({ q }: { q: string | null }) {
  const { profiles, roleMap, grantablePool } = await loadUsersAndRoles(q);

  return (
    <div className="space-y-4">
      <form method="get" action="/app/admin" className="flex items-center gap-2">
        <input type="hidden" name="tab" value="users" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or email"
          className="w-80 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md border px-3 py-2 text-sm">Search</button>
      </form>

      {profiles.length === 0 ? (
        <p className="text-sm text-gray-600">No users found.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {profiles.map((p) => {
            const roles = roleMap.get(p.id) ?? [];
            const grantable = grantablePool.filter(r => !roles.includes(r));

            return (
              <li key={p.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.full_name ?? "(no name)"}</div>
                    <div className="text-xs text-gray-500">
                      {p.email ?? ""} {p.department ? `• ${p.department}` : ""} {p.job_description ? `• ${p.job_description}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/app/admin/users/${p.id}`} className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50">
                      Edit
                    </Link>
                  </div>
                </div>

                {/* Current roles */}
                <div className="flex items-center gap-2 flex-wrap">
                  {roles.length === 0 ? (
                    <span className="text-xs text-gray-500">No roles</span>
                  ) : (
                    roles.map((r) => (
                      <span key={r} className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs">
                        {r}
                        <form action="/app/admin/users/roles/revoke" method="post">
                          <input type="hidden" name="user_id" value={p.id} />
                          <input type="hidden" name="role" value={r} />
                          <button title="Revoke" className="opacity-70 hover:opacity-100">×</button>
                        </form>
                      </span>
                    ))
                  )}
                </div>

                {/* Grant role */}
                <form action="/app/admin/users/roles/grant" method="post" className="flex items-center gap-2">
                  <input type="hidden" name="user_id" value={p.id} />
                  <select name="role" className="rounded-md border px-2 py-1 text-xs">
                    {grantable.length ? (
                      grantable.map((r) => <option key={r} value={r}>{r}</option>)
                    ) : (
                      <option value="" disabled>No more roles</option>
                    )}
                  </select>
                  <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" disabled={!grantable.length}>
                    Grant
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}