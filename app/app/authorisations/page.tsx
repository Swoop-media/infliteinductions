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
  restrictions: string | null;
};

const ITEMS_PER_PAGE = 50;

async function loadCompletedAuthorisationsWithFilters(
  q: string | null,
  departmentFilter: string | null,
  authorisationFilter: string | null,
  page: number = 1
) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  
  // Check if user has General role or Admin role
  const hasGeneralRole = await hasRole("General");
  const hasAdminRole = await hasRole("Admin");
  if (!hasGeneralRole && !hasAdminRole) redirect("/app/home?banner=no_access");

  const offset = (page - 1) * ITEMS_PER_PAGE;

  // First, get the filtered user IDs if department filter is applied
  let userIds: string[] | null = null;
  if (departmentFilter && departmentFilter.trim() && departmentFilter !== "all") {
    console.log("Filtering by department:", departmentFilter);
    const { data: filteredUsers, error: deptError } = await supabase
      .from("profiles")
      .select("id")
      .eq("department", departmentFilter);
    
    if (deptError) {
      console.error("Error filtering by department:", deptError);
    }
    
    userIds = filteredUsers ? filteredUsers.map(u => u.id) : [];
    console.log(`Found ${userIds.length} users in department ${departmentFilter}`);
    
    // If no users found for this department, return empty results
    if (userIds.length === 0) {
      return {
        data: [],
        totalCount: 0
      };
    }
  }

  // Build base query for data
  let query = supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      completed_at,
      restrictions,
      profiles!authorisation_assignments_user_id_fkey(full_name, email, department),
      authorisations!inner(title, valid_for_days)
    `, { count: 'exact' })
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null);

  // Build count query (same filters but only count)
  let countQuery = supabase
    .from("authorisation_assignments")
    .select('*', { count: 'exact', head: true })
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null);

  // Apply department filter using user IDs
  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
    countQuery = countQuery.in("user_id", userIds);
  }

  // Apply search filter if provided (search user name, email, or authorisation title)
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    
    // For search, we need to filter after fetching because of the complex joins
    // First, get user IDs matching the search term
    const { data: searchUsers } = await supabase
      .from("profiles")
      .select("id")
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
    
    // Also get authorisation IDs matching the search term
    const { data: searchAuths } = await supabase
      .from("authorisations")
      .select("id")
      .ilike("title", `%${searchTerm}%`);
    
    const matchingUserIds = searchUsers ? searchUsers.map(u => u.id) : [];
    const matchingAuthIds = searchAuths ? searchAuths.map(a => a.id) : [];
    
    // Apply the combined filter - match either user OR authorisation
    if (matchingUserIds.length > 0 || matchingAuthIds.length > 0) {
      if (matchingUserIds.length > 0 && matchingAuthIds.length > 0) {
        // Match either user or authorisation
        query = query.or(`user_id.in.(${matchingUserIds.map(id => `"${id}"`).join(',')}),authorisation_id.in.(${matchingAuthIds.map(id => `"${id}"`).join(',')})`);
        countQuery = countQuery.or(`user_id.in.(${matchingUserIds.map(id => `"${id}"`).join(',')}),authorisation_id.in.(${matchingAuthIds.map(id => `"${id}"`).join(',')})`);
      } else if (matchingUserIds.length > 0) {
        query = query.in("user_id", matchingUserIds);
        countQuery = countQuery.in("user_id", matchingUserIds);
      } else if (matchingAuthIds.length > 0) {
        query = query.in("authorisation_id", matchingAuthIds);
        countQuery = countQuery.in("authorisation_id", matchingAuthIds);
      }
    } else {
      // No matches found, return empty result
      return {
        data: [],
        totalCount: 0
      };
    }
  }

  // Apply authorisation filter if provided  
  if (authorisationFilter && authorisationFilter.trim() && authorisationFilter !== "all") {
    query = query.eq("authorisation_id", authorisationFilter);
    countQuery = countQuery.eq("authorisation_id", authorisationFilter);
  }

  // Apply pagination and ordering to main query
  query = query
    .order("completed_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const [{ data: rows, error, count }, { count: totalCount }] = await Promise.all([
    query,
    countQuery
  ]);

  if (error) {
    console.log("Authorisation query error:", error);
    return { data: [], totalCount: 0 };
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
    restrictions: row.restrictions ?? null,
  }));

  return {
    data: completedAuthorisations,
    totalCount: totalCount || 0
  };
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

function PaginationControls({ 
  currentPage, 
  totalPages, 
  baseUrl,
  searchParams 
}: { 
  currentPage: number; 
  totalPages: number;
  baseUrl: string;
  searchParams: URLSearchParams;
}) {
  if (totalPages <= 1) return null;

  // Create page links with existing search params
  const createPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    return `${baseUrl}?${params.toString()}`;
  };

  // Calculate which page numbers to show
  const pageNumbers: (number | string)[] = [];
  const maxVisible = 7; // Maximum number of page buttons to show

  if (totalPages <= maxVisible) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    // Show first, last, and pages around current
    pageNumbers.push(1);
    
    if (currentPage > 3) {
      pageNumbers.push('...');
    }
    
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      if (!pageNumbers.includes(i)) {
        pageNumbers.push(i);
      }
    }
    
    if (currentPage < totalPages - 2) {
      pageNumbers.push('...');
    }
    
    if (!pageNumbers.includes(totalPages)) {
      pageNumbers.push(totalPages);
    }
  }

  return (
    <div className="flex items-center justify-center space-x-2 mt-6">
      {/* Previous Button */}
      {currentPage > 1 ? (
        <Link
          href={createPageUrl(currentPage - 1)}
          className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Previous
        </Link>
      ) : (
        <span className="px-3 py-2 rounded-md border border-gray-300 bg-gray-100 text-sm font-medium text-gray-400 cursor-not-allowed">
          Previous
        </span>
      )}

      {/* Page Numbers */}
      {pageNumbers.map((pageNum, index) => {
        if (pageNum === '...') {
          return (
            <span key={`ellipsis-${index}`} className="px-3 py-2 text-sm text-gray-700">
              ...
            </span>
          );
        }
        
        const page = pageNum as number;
        const isActive = page === currentPage;
        
        return (
          <Link
            key={page}
            href={createPageUrl(page)}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              isActive
                ? 'border border-blue-500 bg-blue-50 text-blue-600'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {page}
          </Link>
        );
      })}

      {/* Next Button */}
      {currentPage < totalPages ? (
        <Link
          href={createPageUrl(currentPage + 1)}
          className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Next
        </Link>
      ) : (
        <span className="px-3 py-2 rounded-md border border-gray-300 bg-gray-100 text-sm font-medium text-gray-400 cursor-not-allowed">
          Next
        </span>
      )}
    </div>
  );
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
  const pageParam = Array.isArray(resolvedSearchParams?.page) ? resolvedSearchParams?.page[0] : resolvedSearchParams?.page;
  const currentPage = Math.max(1, parseInt(pageParam || '1', 10));

  const [{ data: completedAuthorisations, totalCount }, departments, authorisations] = await Promise.all([
    loadCompletedAuthorisationsWithFilters(q, departmentFilter, authorisationFilter, currentPage),
    loadDepartments(),
    loadAuthorisations()
  ]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);

  // Create URLSearchParams for pagination links
  const urlSearchParams = new URLSearchParams();
  if (q) urlSearchParams.set('q', q);
  if (departmentFilter && departmentFilter !== 'all') urlSearchParams.set('department', departmentFilter);
  if (authorisationFilter && authorisationFilter !== 'all') urlSearchParams.set('authorisation', authorisationFilter);

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
            {/* User/Authorisation Search */}
            <div className="flex-1 min-w-60">
              <label htmlFor="q" className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search by user name, email, or authorisation..."
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
                Authorisation Type
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
          {(q || (departmentFilter && departmentFilter !== "all") || (authorisationFilter && authorisationFilter !== "all")) && (
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {totalCount > 0 ? (
              <>Showing {startItem}-{endItem} of {totalCount} Authorisations</>
            ) : (
              "No Results"
            )}
          </h2>
          {totalCount > ITEMS_PER_PAGE && (
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
          )}
        </div>
        
        {completedAuthorisations.length === 0 ? (
          <p className="text-sm text-gray-600">
            {q || departmentFilter || authorisationFilter 
              ? "No completed authorisations found matching your filters." 
              : "No completed authorisations found."}
          </p>
        ) : (
          <>
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
                          {auth.restrictions && (
                            <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                              <span className="font-medium">Restrictions:</span> {auth.restrictions}
                            </div>
                          )}
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

            {/* Pagination Controls */}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              baseUrl="/app/authorisations"
              searchParams={urlSearchParams}
            />
          </>
        )}
      </div>
    </div>
  );
}