
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

type ArchivedProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  job_description?: string | null;
  archived_at: string;
};

async function loadArchivedUsers() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ArchivedProfile[];
}

export default async function ArchivedUsersPage() {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const archivedUsers = await loadArchivedUsers();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Archived Users</h1>
        <Link
          href="/app/admin?tab=users"
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Active Users
        </Link>
      </div>

      {archivedUsers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No archived users found.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Archived Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {archivedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{user.full_name || "—"}</td>
                  <td className="px-4 py-3 text-sm">{user.email || "—"}</td>
                  <td className="px-4 py-3 text-sm">{user.department || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(user.archived_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <form action="/app/admin/users/restore" method="post" className="inline">
                      <input type="hidden" name="user_id" value={user.id} />
                      <button
                        type="submit"
                        className="rounded border border-green-500 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
                        onClick={(e) => {
                          if (!confirm(`Restore user ${user.full_name || user.email}? They will become visible in all lists again.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Restore
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
