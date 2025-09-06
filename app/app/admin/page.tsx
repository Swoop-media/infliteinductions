// app/app/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import SortableDueDatesTable from "./_components/SortableDueDatesTable";
import SortableUsersTable from "./_components/SortableUsersTable";


export const dynamic = "force-dynamic";

type TabKey = "due_dates_courses" | "due_dates_authorisations" | "users" | "pending_authorisations";

function tabFromSearch(sp: Record<string, string | string[] | undefined>): TabKey {
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab || "";
  if (raw === "users") return "users";
  if (raw === "due_dates_authorisations") return "due_dates_authorisations";
  if (raw === "pending_authorisations") return "pending_authorisations";
  return "due_dates_courses";
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
  completed_at: string;
  title: string;
  valid_for_days: number;
  retake_reminder_days: number;
  new_due_date: string;
  days_until_expiry: string;
  notification_status: string;
  trainee_email: string;
  trainee_name: string;
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

  // Transform data to match client component expectations
  let completedCourses = assignments.map((assignment) => {
    const profile = profileMap.get(assignment.user_id);
    const course = courseMap.get(assignment.course_id);

    // Calculate due date
    const completedDate = new Date(assignment.completed_at);
    const validForDays = course?.valid_for_days || 365;
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    // Calculate days until expiry
    const today = new Date();
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Determine notification status
    let notificationStatus = "NO NOTIFICATION";
    if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
      notificationStatus = "SHOULD TRIGGER REMINDER";
    } else if (daysUntilExpiry <= 0) {
      notificationStatus = "REMINDER SENT";
    }

    return {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      completed_at: assignment.completed_at,
      title: course?.title || "Unknown Course",
      valid_for_days: validForDays,
      retake_reminder_days: 30, // Default reminder threshold
      new_due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry.toString(),
      notification_status: notificationStatus,
      trainee_email: profile?.email || "",
      trainee_name: profile?.full_name || "",
    };
  });

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    completedCourses = completedCourses.filter(course =>
      (course.trainee_name?.toLowerCase().includes(searchTerm)) ||
      (course.trainee_email?.toLowerCase().includes(searchTerm)) ||
      (course.title?.toLowerCase().includes(searchTerm))
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

  // Profiles (exclude archived users)
  let profs: Profile[] = [];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, job_description")
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    profs = (data ?? []) as Profile[];
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, job_description")
      .is("archived_at", null)
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
    { key: "due_dates_courses", label: "Due Dates - Courses", href: "/app/admin?tab=due_dates_courses" },
    { key: "due_dates_authorisations", label: "Due Dates - Authorisations", href: "/app/admin?tab=due_dates_authorisations" },
    { key: "users", label: "Users & Roles", href: "/app/admin?tab=users" },
    { key: "pending_authorisations", label: "Pending Authorisations", href: "/app/admin?tab=pending_authorisations" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          {/* Removed unnecessary buttons */}
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
        {tab === "due_dates_courses" ? (
          <DueDatesCourseSection q={q} />
        ) : tab === "due_dates_authorisations" ? (
          <DueDatesAuthorisationSection q={q} />
        ) : tab === "users" ? (
          <UsersSection q={q} />
        ) : (
          <PendingAuthorisationsSection q={q} />
        )}
      </div>
    </div>
  );
}

/* --------------------------
   SUBSECTIONS
---------------------------*/

async function DueDatesCourseSection({ q }: { q: string | null }) {
  const completedCourses = await loadCompletedCoursesWithDueDates(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Course Due Dates</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="due_dates_courses" />
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

async function DueDatesAuthorisationSection({ q }: { q: string | null }) {
  const completedAuthorisations = await loadCompletedAuthorisationsWithDueDates(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Authorisation Due Dates</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="due_dates_authorisations" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, authorisation, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      {completedAuthorisations.length === 0 ? (
        <p className="text-sm text-gray-600">No completed authorisations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trainee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Authorisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {completedAuthorisations.map((auth) => {
                  const approvedDate = new Date(auth.approved_at).toLocaleDateString();

                  // Calculate due date based on approval date and valid days
                  const dueDate = auth.valid_for_days 
                    ? new Date(new Date(auth.approved_at).getTime() + (auth.valid_for_days * 24 * 60 * 60 * 1000)).toLocaleDateString()
                    : "No expiry";

                  // Determine status based on current date vs due date
                  const now = new Date();
                  let statusText = "Current";
                  let statusColor = "text-green-600";

                  if (auth.valid_for_days) {
                    const dueDateObj = new Date(new Date(auth.approved_at).getTime() + (auth.valid_for_days * 24 * 60 * 60 * 1000));
                    const daysDiff = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                    if (daysDiff < 0) {
                      statusText = "Expired";
                      statusColor = "text-red-600";
                    } else if (daysDiff <= 30) {
                      statusText = "Expiring Soon";
                      statusColor = "text-yellow-600";
                    }
                  }
                return (
                  <tr key={auth.assignment_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{auth.full_name || 'N/A'}</td>
                    <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.authorisation_title}</div>
                        <div className="text-xs text-gray-500">
                          Valid for: {auth.valid_for_days ? `${auth.valid_for_days} days` : 'No expiry'}
                        </div>
                      </td>
                      <td className="border-b px-4 py-3 text-sm">{approvedDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dueDate}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${statusColor}`}>
                      {statusText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function loadCompletedAuthorisationsWithDueDates(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  // Get the authorisation assignments first
  let query = supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      approved_at,
      authorisations!inner(title, valid_for_days)
    `)
    .eq("assignment_status", "completed")
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false });

  const { data: assignments, error: assignError } = await query.limit(100);
  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Get user profiles separately to avoid relationship ambiguity
  const userIds = [...new Set(assignments.map(a => a.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  // Create a lookup map for profiles
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // Combine the data
  const rows = assignments.map(assignment => ({
    ...assignment,
    profiles: profileMap.get(assignment.user_id)
  }));

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    const filteredRows = rows.filter(row => {
      const profile = row.profiles;
      return (
        (profile?.full_name?.toLowerCase().includes(searchTerm) ?? false) ||
        (profile?.email?.toLowerCase().includes(searchTerm) ?? false) ||
        ((row as any).authorisations?.title?.toLowerCase().includes(searchTerm) ?? false)
      );
    });
    
    const { data: filteredData, error } = { data: filteredRows, error: null };

  return filteredData.map((row: any) => ({
      assignment_id: row.id,
      user_id: row.user_id,
      authorisation_id: row.authorisation_id,
      approved_at: row.approved_at,
      full_name: row.profiles?.full_name ?? null,
      email: row.profiles?.email ?? null,
      authorisation_title: row.authorisations?.title ?? null,
      valid_for_days: row.authorisations?.valid_for_days ?? null,
    }));
  }

  // Map to the expected format
  const completedAuthorisations: AuthorisationCompletionRow[] = rows.map((row: any) => ({
    assignment_id: row.id,
    user_id: row.user_id,
    authorisation_id: row.authorisation_id,
    approved_at: row.approved_at,
    full_name: row.profiles?.full_name ?? null,
    email: row.profiles?.email ?? null,
    authorisation_title: row.authorisations?.title ?? null,
    valid_for_days: row.authorisations?.valid_for_days ?? null,
  }));

  return completedAuthorisations;
}

type AuthorisationCompletionRow = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  approved_at: string;
  full_name: string | null;
  email: string | null;
  authorisation_title: string | null;
  valid_for_days: number | null;
};

async function UsersSection({ q }: { q: string | null }) {
  const { profiles, roleMap, grantablePool } = await loadUsersAndRoles(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium">Users & Roles</h3>
        <div className="flex gap-2">
          <Link
            href="/app/admin/users/archived"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            View Archived Users
          </Link>
          <Link
            href="/app/admin/users/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Add New User
          </Link>
        </div>
      </div>

      <form method="get" action="/app/admin" className="flex items-center gap-2">
        <input type="hidden" name="tab" value="users" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, email, or department"
          className="w-80 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md border px-3 py-2 text-sm">Search</button>
      </form>

      {profiles.length === 0 ? (
        <p className="text-sm text-gray-600">No users found.</p>
      ) : (
        <SortableUsersTable
          profiles={profiles}
          roleMap={roleMap}
          grantablePool={grantablePool}
        />
      )}
    </div>
  );
}

/* --------------------------
   PENDING AUTHORISATIONS
---------------------------*/
type PendingAuthorisationRow = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  authorisation_title: string;
  trainee_name: string;
  trainee_email: string;
  completed_at: string;
  total_courses: number;
  completed_courses: number;
};

async function loadPendingAuthorisations(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors")) || (await hasRole("Senior Management"));
  if (!allowed) redirect("/app/home?banner=no_access");

  // Get all authorisation assignments that are completed
  const { data: assignments, error: assignError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      assignment_status,
      completed_at,
      authorisations!inner(
        id,
        title
      )
    `)
    .eq("assignment_status", "pending_approval")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Get user profiles separately to avoid relationship ambiguity
  const userIds = [...new Set(assignments.map(a => a.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  // Create a lookup map for profiles
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // For each completed authorisation, verify all courses are actually completed
  const pendingAuthorisations: PendingAuthorisationRow[] = [];

  for (const assignment of assignments) {
    // Get all courses for this authorisation
    const { data: authCourses, error: coursesError } = await supabase
      .from("authorisation_courses")
      .select(`
        course_id,
        courses!inner(
          id,
          title
        )
      `)
      .eq("authorisation_id", assignment.authorisation_id);

    if (coursesError) continue;
    if (!authCourses || authCourses.length === 0) continue;

    const courseIds = authCourses.map(ac => ac.course_id);

    // Check how many of these courses the user has completed
    const { data: completedCourses, error: completedError } = await supabase
      .from("course_assignments")
      .select("id, course_id")
      .eq("user_id", assignment.user_id)
      .eq("assignment_status", "completed")
      .in("course_id", courseIds);

    if (completedError) continue;

    const completedCount = completedCourses?.length || 0;
    const totalCount = authCourses.length;

    // Only include if all courses are completed (100%)
    if (completedCount === totalCount && totalCount > 0) {
      const profile = profileMap.get(assignment.user_id);
      pendingAuthorisations.push({
        assignment_id: assignment.id,
        user_id: assignment.user_id,
        authorisation_id: assignment.authorisation_id,
        authorisation_title: (assignment as any).authorisations.title,
        trainee_name: profile?.full_name || "",
        trainee_email: profile?.email || "",
        completed_at: assignment.completed_at,
        total_courses: totalCount,
        completed_courses: completedCount,
      });
    }
  }

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    return pendingAuthorisations.filter(auth =>
      auth.trainee_name.toLowerCase().includes(searchTerm) ||
      auth.trainee_email.toLowerCase().includes(searchTerm) ||
      auth.authorisation_title.toLowerCase().includes(searchTerm)
    );
  }

  return pendingAuthorisations;
}

async function PendingAuthorisationsSection({ q }: { q: string | null }) {
  const pendingAuthorisations = await loadPendingAuthorisations(q);
  const isSeniorManager = await hasRole("Senior Management");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pending Authorisations</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="pending_authorisations" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, authorisation, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      {pendingAuthorisations.length === 0 ? (
        <p className="text-sm text-gray-600">No pending authorisations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Authorisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trainee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Courses
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingAuthorisations.map((auth) => (
                <tr key={auth.assignment_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {auth.authorisation_title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{auth.trainee_name}</div>
                    <div className="text-sm text-gray-500">{auth.trainee_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(auth.completed_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {auth.completed_courses}/{auth.total_courses} completed
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {isSeniorManager ? (
                      <Link
                        href={`/app/admin/review/${auth.assignment_id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Review
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-xs">Senior Manager Only</span>
                    )}
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