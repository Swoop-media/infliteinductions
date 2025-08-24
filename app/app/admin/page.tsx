// app/app/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

type TabKey = "enrolments" | "users";

function tabFromSearch(sp: Record<string, string | string[] | undefined>): TabKey {
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab || "";
  return raw === "users" ? "users" : "enrolments";
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
      ok === "enrolment_approved" ? "Enrolment approved." :
      ok === "enrolment_revoked" ? "Enrolment revoked." :
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
   ENROLMENTS (unchanged logic)
---------------------------*/
async function detectEnrolmentTable(supabase: Awaited<ReturnType<typeof createSupabaseServer>>): Promise<"course_enrolments"|"enrolments"> {
  let { error } = await supabase.from("course_enrolments").select("id").limit(1);
  if (!error) return "course_enrolments";
  return "enrolments";
}

type EnrolRow = { id: string; course_id: string; user_id: string; status: string | null; created_at: string | null };

async function loadPendingEnrolments() {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const table = await detectEnrolmentTable(supabase);
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, course_id, user_id, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  const enrols = (rows ?? []) as EnrolRow[];

  const courseIds = Array.from(new Set(enrols.map(r => r.course_id).filter(Boolean)));
  const userIds = Array.from(new Set(enrols.map(r => r.user_id).filter(Boolean)));

  const [{ data: courses }, { data: profiles }] = await Promise.all([
    courseIds.length
      ? supabase.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const courseMap = new Map<string, any>();
  (courses ?? []).forEach(c => courseMap.set(c.id, c));
  const profileMap = new Map<string, any>();
  (profiles ?? []).forEach(p => profileMap.set(p.id, p));

  return { enrols, courseMap, profileMap, table };
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
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const tab = tabFromSearch(searchParams ?? {});
  const ok =
    (Array.isArray(searchParams?.ok) ? searchParams?.ok[0] : searchParams?.ok) ?? null;
  const error =
    (Array.isArray(searchParams?.error) ? searchParams?.error[0] : searchParams?.error) ?? null;

  const q =
    (Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q) ?? null;

  const tabs: { key: TabKey; label: string; href: string }[] = [
    { key: "enrolments", label: "Enrolments", href: "/app/admin?tab=enrolments" },
    { key: "users", label: "Users & Roles", href: "/app/admin?tab=users" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          <Link href="/app/courses" className="rounded-md border px-3 py-1 text-sm">Courses</Link>
          <Link href="/app/authorisations" className="rounded-md border px-3 py-1 text-sm">Authorisations</Link>
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
        {tab === "enrolments" ? (
          <EnrolmentsSection />
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

async function EnrolmentsSection() {
  const { enrols, courseMap, profileMap, table } = await loadPendingEnrolments();

  if (enrols.length === 0) {
    return <p className="text-sm text-gray-600">No pending enrolments.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        Showing pending from <code>{table}</code>
      </div>

      <ul className="divide-y rounded-md border">
        {enrols.map((e) => {
          const c = courseMap.get(e.course_id);
          const p = profileMap.get(e.user_id);
          return (
            <li key={e.id} className="flex items-center justify-between p-3">
              <div className="space-y-0.5">
                <div className="font-medium">{p?.full_name ?? e.user_id}</div>
                <div className="text-xs text-gray-500">
                  {p?.email ?? ""} • {c?.title ?? e.course_id} • {e.status ?? "pending"}
                </div>
              </div>

              {/* Actions: Approve & Revoke (separate forms; no nesting) */}
              <div className="flex gap-2">
                <form action="/app/admin/enrolments/approve" method="post">
                  <input type="hidden" name="enrolment_id" value={e.id} />
                  <button className="rounded-md border px-3 py-1 text-xs hover:bg-green-50">
                    Approve
                  </button>
                </form>

                <form action="/app/admin/enrolments/revoke" method="post">
                  <input type="hidden" name="enrolment_id" value={e.id} />
                  <button className="rounded-md border px-3 py-1 text-xs hover:bg-red-50">
                    Revoke
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
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
