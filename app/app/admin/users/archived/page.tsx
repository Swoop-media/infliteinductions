
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

type ArchivedProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  archived_at: string;
};

async function loadArchivedUsers() {
  const supabase = await createSupabaseServer();
  
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    console.error("Error loading archived users:", error);
    return [];
  }

  return profiles as ArchivedProfile[];
}

async function restoreUser(userId: string) {
  "use server";
  
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !(await hasRole(user.id, "Admin"))) {
    return { error: "Unauthorized" };
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/app/admin/users/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    return { error: "Failed to restore user" };
  }

  return { success: true };
}

export default async function ArchivedUsersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const isAdmin = await hasRole(user.id, "Admin");
  if (!isAdmin) {
    redirect("/app");
  }

  const archivedUsers = await loadArchivedUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Archived Users</h1>
          <p className="text-gray-600">Users that have been archived</p>
        </div>
        <Link
          href="/app/admin/users"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Back to Active Users
        </Link>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Department</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Archived</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {archivedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No archived users found
                  </td>
                </tr>
              ) : (
                archivedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {user.full_name || "No name"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.department || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(user.archived_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <form action={async () => {
                        "use server";
                        await restoreUser(user.id);
                        redirect("/app/admin/users/archived");
                      }}>
                        <button
                          type="submit"
                          className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                        >
                          Restore
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
