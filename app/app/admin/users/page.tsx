import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  job_description: string | null;
  microsoft_id: string | null;
};

type Role = { id: string; name: string };
type UR = { user_id: string; role_id: string };

const ROLE_ORDER = [
  "General",
  "Trainers and Assessors",
  "Course creators",
  "Senior Person",
  "Admin",
];

async function fetchData(search: string | null) {
  const supabase = await createSupabaseServer();

  const { data: rolesData } = await supabase.from("roles").select("id, name");
  const roles: Role[] = rolesData ?? [];

  let profQuery = supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description, microsoft_id")
    .order("full_name", { ascending: true })
    .limit(200)
    .is("archived_at", null);

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    profQuery = profQuery.or(
      `full_name.ilike.${s},email.ilike.${s},department.ilike.${s},job_description.ilike.${s}`
    );
  }

  const { data: profilesData, error: profilesErr } = await profQuery;
  const profiles: Profile[] = profilesData ?? [];
  if (profilesErr) {
    return { roles, profiles: [], userRoles: [], error: profilesErr.message };
  }

  let userRoles: UR[] = [];
  if (profiles.length) {
    const userIds = profiles.map((p) => p.id);
    const { data: urData, error: urErr } = await supabase
      .from("user_roles")
      .select("user_id, role_id")
      .in("user_id", userIds);
    if (urErr) {
      return { roles, profiles, userRoles: [], error: urErr.message };
    }
    userRoles = urData ?? [];
  }

  return { roles, profiles, userRoles, error: null as string | null };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const search =
    (Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q) ??
    null;

  const { roles, profiles, userRoles, error } = await fetchData(search);

  const safeRoles: Role[] = roles ?? [];
  const assigned = new Map<string, Set<string>>();
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin: Users & Roles</h1>
        <div className="flex gap-2">
          <Link
            href="/app/admin/users/archived"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Archived Users
          </Link>
          <Link
            href="/app/admin/users/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Add New User
          </Link>
        </div>
      </div>

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
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Microsoft ID</th>
              <th className="px-3 py-2 text-left font-medium">Department</th>
              <th className="px-3 py-2 text-left font-medium">Job</th>
              {sortedRoles.map((r) => (
                <th key={r.id} className="px-3 py-2 text-left font-medium">
                  {r.name}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Edit</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(profiles ?? []).map((p: Profile) => {
              const set = assigned.get(p.id) ?? new Set<string>();
              return (
                <tr key={p.id} className="bg-white">
                  <td className="px-3 py-2">{p.full_name ?? "-"}</td>
                  <td className="px-3 py-2">{p.email ?? "-"}</td>
                  <td className="px-3 py-2">
                    {p.microsoft_id ? (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {p.microsoft_id.substring(0, 8)}...
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
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
                  <td className="px-3 py-2">
                    <Link
                      href={`/app/admin/users/${p.id}`}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      Edit
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <form action={async (formData: FormData) => {
                      "use server";
                      const userId = formData.get("user_id") as string;
                      const supabase = await createSupabaseServer();
                      
                      const { error } = await supabase
                        .from("profiles")
                        .update({ archived_at: new Date().toISOString() })
                        .eq("id", userId);
                      
                      if (error) {
                        console.error("Archive error:", error);
                      }
                      
                      redirect("/app/admin/users");
                    }}>
                      <input type="hidden" name="user_id" value={p.id} />
                      <button
                        className="rounded-md border px-2 py-1 text-xs"
                        title="Archive user"
                      >
                        Archive
                      </button>
                    </form>
                  </td>
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