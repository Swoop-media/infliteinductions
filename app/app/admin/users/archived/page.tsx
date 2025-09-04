import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

type ArchivedProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  job_description?: string | null;
  archived_at: string | null;
};

async function loadArchivedUsers() {
  const supabase = await createSupabaseServer();

  // Get archived profiles
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    console.error("Error loading archived users:", error);
    return [];
  }

  return profiles || [];
}

function RestoreButton({ userId }: { userId: string }) {
  const restoreUser = async () => {
    if (!confirm("Are you sure you want to restore this user? They will be visible in the system again.")) {
      return;
    }

    try {
      const response = await fetch("/app/admin/users/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        alert("Failed to restore user");
      }
    } catch (error) {
      console.error("Error restoring user:", error);
      alert("Error restoring user");
    }
  };

  return (
    <button
      onClick={restoreUser}
      className="rounded border border-green-500 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
    >
      Restore
    </button>
  );
}

export default async function ArchivedUsersPage() {
  // Check admin role
  const hasAdminRole = await hasRole("Admin");
  if (!hasAdminRole) {
    redirect("/app/home?banner=no_access");
  }

  const archivedUsers = await loadArchivedUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Archived Users</h1>
          <p className="text-sm text-gray-600">
            Users that have been archived and are hidden from the main user list.
          </p>
        </div>
        <Link
          href="/app/admin/users"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Back to Active Users
        </Link>
      </div>

      {archivedUsers.length === 0 ? (
        <div className="rounded-md border bg-white p-8 text-center">
          <p className="text-gray-500">No archived users found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Department</th>
                <th className="px-3 py-2 text-left font-medium">Archived Date</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {archivedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {user.full_name ?? "(no name)"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {user.email ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {user.department ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {user.archived_at ? new Date(user.archived_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <RestoreButton userId={user.id} />
                    </div>
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