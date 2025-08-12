import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  job_description: string | null;
};

type Role = { id: string; name: string };
type UR = { user_id: string; role_id: string };

const ROLE_ORDER = [
  "General",
  "Trainers and Assessors",
  "Course creators",
  "Senior management",
  "Admin",
];

async function fetchData(search: string | null) {
  const supabase = createSupabaseServer();

  // --- roles ---
  const {
    data: rolesData,
    error: rolesErr,
  } = await supabase.from("roles").select("id, name");
  const roles: Role[] = rolesData ?? [];

  // --- profiles (basic search) ---
  let profQuery = supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .order("full_name", { ascending: true })
    .limit(200);

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    // ilike OR across columns
    profQuery = profQuery.or(
      `full_name.ilike.${s},email.ilike.${s},department.ilike.${s},job_description.ilike.${s}`
    );
  }

  const {
    data: profilesData,
    error: profilesErr,
  } = await profQuery;
  const profiles: Profile[] = profilesData ?? [];

  // --- user_roles for the currently listed users ---
  let userRoles: UR[] = [];
  if (profiles.length) {
    const userIds = profiles.map((p) => p.id);
    const {
      data: urData,
      error: urErr,
    } = await supabase
      .from("user_roles")
      .select("user_id, role_id")
      .in("user_id", userIds);

    if (urErr) {
      return {
        roles,
        profiles,
        userRoles: [] as UR[],
        error:
          rolesErr?.message ??
          profilesErr?.message ??
          urErr.message ??
          null,
      };
    }
    userRoles = urData ?? [];
  }

  const error =
    rolesErr?.message ?? profilesErr?.message ?? null;

  return { roles, profiles, userRoles, error };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Guard: only Admins
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const search =
    (Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q) ??
    null;

  const { roles, profiles, userRoles, error } = await fetchData(search);

  // Safe maps (coalesce to empty arrays)
  const safeRoles: Role[] = roles ?? [];
  const roleById = new Map(safeRoles.map((r) => [r.id, r]));
  const assigned = new Map<string, Set<string>>(); // user_id -> Set(role_id)
  (userRoles ?? []).forEach((ur) => {
    if (!assigned.has(ur.user_id)) assigned.set(ur.user_id, new Set());
    assigned.get(ur.user_id)!.add(ur.role_id);
  });

  const sortedRoles = [...safeRoles].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.name);
    const ib = ROLE_ORDER.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin: Users & Roles</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form className="flex gap-2" action="/app/admin/users" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search ?? ""}
          className="w-72 rounded-md border px-3 py-2 text-sm"
          placeholder="Search name, email, department…"
        />
        <button className="rounded-md border px-3 py-2 text-sm">Search</button>
      </form>

      <div className="rounded-lg border overflow-x-auto">
        <table className="min-w-[800px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Department</th>
              <th className="px-3 py-2 text-left font-medium">Job</th>
              {sortedRoles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-left font-medium">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(profiles ?? []).map((p: Profile) => {
              const set = assigned.get(p.id) ?? new Set<string>();
              return (
                <tr key={p.id} className="bg-white">
                  <td className="px-3 py-2">{p.full_name ?? "-"}</td>
                  <td className="px-3 py-2">{p.email ?? "-"}</td>
                  <td className="px-3 py-2">{p.department ?? "-"}</td>
                  <td className="px-3 py-2">{p.job_description ?? "-"}</td>
                  {sortedRoles.map((r) => {
                    const has = set.has(r.id);
                    return (
                      <td key={r.id} className="px-3 py-2">
                        <form action="/app/admin/users/roles" method="post">
                          <input type="hidden" name="user_id" value={p.id} />
                          <input type="hidden" name="role_name" value={r.name} />
                          <input
                            type="hidden"
                            name="action"
                            value={has ? "revoke" : "grant"}
                          />
                          <button
                            className={
                              has
                                ? "rounded-md bg-green-600 px-2 py-1 text-xs text-white"
                                : "rounded-md border px-2 py-1 text-xs"
                            }
                            title={has ? "Revoke role" : "Grant role"}
                          >
                            {has ? "On" : "Off"}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(profiles ?? []).length === 0 && (
        <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
          No users found.
        </div>
      )}
    </div>
  );
}
