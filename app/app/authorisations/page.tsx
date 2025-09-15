// @ts-nocheck

// app/app/authorisations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

type AuthorisationCompletionRow = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  authorisation_title: string | null;
  valid_for_days: number | null;
};

async function loadCompletedAuthorisationsWithFilters(
  q: string | null,
  departmentFilter: string | null,
  authorisationFilter: string | null
) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  
  // Check if user has General role or Admin role
  const hasGeneralRole = await hasRole("General");
  const hasAdminRole = await hasRole("Admin");
  if (!hasGeneralRole && !hasAdminRole) redirect("/app/home?banner=no_access");

  let query = supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      completed_at,
      profiles!authorisation_assignments_user_id_fkey(full_name, email, department),
      authorisations!inner(title, valid_for_days)
    `)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  // Apply search filter if provided (search user name or email)
  if (q && q.trim()) {
    const searchTerm = `%${q.trim()}%`;
    query = query.or(`profiles!authorisation_assignments_user_id_fkey.full_name.ilike.${searchTerm},profiles!authorisation_assignments_user_id_fkey.email.ilike.${searchTerm}`);
  }

  // Apply department filter if provided
  if (departmentFilter && departmentFilter.trim() && departmentFilter !== "all") {
    query = query.eq("profiles!authorisation_assignments_user_id_fkey.department", departmentFilter);
  }

  // Apply authorisation filter if provided  
  if (authorisationFilter && authorisationFilter.trim() && authorisationFilter !== "all") {
    query = query.eq("authorisation_id", authorisationFilter);
  }

  const { data: rows, error } = await query.limit(100);

  if (error) {
    console.log("Authorisation query error:", error);
    return [];
  }

  const completedAuthorisations: AuthorisationCompletionRow[] = (rows ?? []).map((row: any) => ({
    assignment_id: row.id,
    user_id: row.user_id,
    authorisation_id: row.authorisation_id,
    completed_at: row.completed_at,
    full_name: row.profiles?.full_name ?? null,
    email: row.profiles?.email ?? null,
    department: row.profiles?.department ?? null,
    authorisation_title: row.authorisations?.title ?? null,
    valid_for_days: row.authorisations?.valid_for_days ?? null,
  }));

  return completedAuthorisations;
}

async function loadDepartments() {
  "use server";
  const supabase = await createSupabaseServer();
  
  const { data: departments } = await supabase
    .from("profiles")
    .select("department")
    .not("department", "is", null)
    .order("department");

  const uniqueDepartments = [...new Set((departments || []).map(d => d.department))].filter(Boolean);
  return uniqueDepartments;
}

async function loadAuthorisations() {
  "use server";
  const supabase = await createSupabaseServer();
  
  const { data: authorisations } = await supabase
    .from("authorisations")
    .select("id, title")
    .eq("status", "active")
    .order("title");

  return authorisations || [];
}

function calculateDueDate(completedAt: string, validForDays: number | null): string {
  if (!validForDays) return "No expiry";
  
  const completedDate = new Date(completedAt);
  const dueDate = new Date(completedDate);
  dueDate.setDate(dueDate.getDate() + validForDays);
  
  return dueDate.toLocaleDateString();
}

function getDaysUntilDue(completedAt: string, validForDays: number | null): number | null {
  if (!validForDays) return null;
  
  const completedDate = new Date(completedAt);
  const dueDate = new Date(completedDate);
  dueDate.setDate(dueDate.getDate() + validForDays);
  
  const today = new Date();
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

export default async function AuthorisationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Check if user has General role or Admin role
  const hasGeneralRole = await hasRole("General");
  const hasAdminRole = await hasRole("Admin");
  if (!hasGeneralRole && !hasAdminRole) redirect("/app/home?banner=no_access");

  const resolvedSearchParams = await searchParams;
  const q = (Array.isArray(resolvedSearchParams?.q) ? resolvedSearchParams?.q[0] : resolvedSearchParams?.q) ?? null;
  const departmentFilter = (Array.isArray(resolvedSearchParams?.department) ? resolvedSearchParams?.department[0] : resolvedSearchParams?.department) ?? null;
  const authorisationFilter = (Array.isArray(resolvedSearchParams?.authorisation) ? resolvedSearchParams?.authorisation[0] : resolvedSearchParams?.authorisation) ?? null;

  const [completedAuthorisations, departments, authorisations] = await Promise.all([
    loadCompletedAuthorisationsWithFilters(q, departmentFilter, authorisationFilter),
    loadDepartments(),
    loadAuthorisations()
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Completed Authorisations</h1>
        <Link href="/app/home" className="rounded-md border px-3 py-1 text-sm">
          Back to Home
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="rounded-xl border bg-white p-4">
        <form method="get" action="/app/authorisations" className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* User Search */}
            <div className="flex-1 min-w-60">
              <label htmlFor="q" className="block text-sm font-medium text-gray-700 mb-1">
                Search User
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search by name or email..."
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            {/* Department Filter */}
            <div className="min-w-48">
              <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                id="department"
                name="department"
                defaultValue={departmentFilter ?? "all"}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Authorisation Filter */}
            <div className="min-w-48">
              <label htmlFor="authorisation" className="block text-sm font-medium text-gray-700 mb-1">
                Authorisation
              </label>
              <select
                id="authorisation"
                name="authorisation"
                defaultValue={authorisationFilter ?? "all"}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="all">All Authorisations</option>
                {authorisations.map((auth) => (
                  <option key={auth.id} value={auth.id}>
                    {auth.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Button */}
            <div>
              <button 
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Filter
              </button>
            </div>
          </div>

          {/* Clear Filters */}
          {(q || departmentFilter !== "all" || authorisationFilter !== "all") && (
            <div>
              <Link
                href="/app/authorisations"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </Link>
            </div>
          )}
        </form>
      </div>

      {/* Results Table */}
      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold mb-4">
          Completed Authorisations ({completedAuthorisations.length})
        </h2>
        
        {completedAuthorisations.length === 0 ? (
          <p className="text-sm text-gray-600">
            {q || departmentFilter || authorisationFilter 
              ? "No completed authorisations found matching your filters." 
              : "No completed authorisations found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">User Name</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Department</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Authorisation</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Completed</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Expiry Date</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedAuthorisations.map((auth) => {
                  const completedDate = new Date(auth.completed_at).toLocaleDateString();
                  const dueDate = calculateDueDate(auth.completed_at, auth.valid_for_days);
                  const daysUntilDue = getDaysUntilDue(auth.completed_at, auth.valid_for_days);
                  
                  let statusColor = "text-green-600";
                  let statusText = "Current";
                  
                  if (daysUntilDue !== null) {
                    if (daysUntilDue < 0) {
                      statusColor = "text-red-600";
                      statusText = `Expired (${Math.abs(daysUntilDue)} days ago)`;
                    } else if (daysUntilDue <= 30) {
                      statusColor = "text-yellow-600";
                      statusText = `Expires in ${daysUntilDue} days`;
                    } else {
                      statusText = `Expires in ${daysUntilDue} days`;
                    }
                  }

                  return (
                    <tr key={auth.assignment_id} className="hover:bg-gray-50">
                      <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.full_name ?? "Unknown"}</div>
                        <div className="text-xs text-gray-500">{auth.email}</div>
                      </td>
                      <td className="border-b px-4 py-3 text-sm">
                        {auth.department ?? "Not specified"}
                      </td>
                      <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.authorisation_title}</div>
                        <div className="text-xs text-gray-500">
                          Valid for: {auth.valid_for_days ? `${auth.valid_for_days} day${auth.valid_for_days > 1 ? 's' : ''}` : 'No expiry'}
                        </div>
                      </td>
                      <td className="border-b px-4 py-3 text-sm">{completedDate}</td>
                      <td className="border-b px-4 py-3 text-sm">{dueDate}</td>
                      <td className={`border-b px-4 py-3 text-sm font-medium ${statusColor}`}>
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
    </div>
  );
}