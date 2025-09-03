
// app/app/admin/authorisations/page.tsx
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
  authorisation_title: string | null;
  valid_for_years: number | null;
};

async function loadCompletedAuthorisationsWithDueDates(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  let query = supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      completed_at,
      profiles!inner(full_name, email),
      authorisations!inner(title, valid_for_years)
    `)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = `%${q.trim()}%`;
    query = query.or(`profiles.full_name.ilike.${searchTerm},profiles.email.ilike.${searchTerm},authorisations.title.ilike.${searchTerm}`);
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
    authorisation_title: row.authorisations?.title ?? null,
    valid_for_years: row.authorisations?.valid_for_years ?? null,
  }));

  return completedAuthorisations;
}

function calculateDueDate(completedAt: string, validForDays: number | null): string {
  if (!validForDays) return "No expiry";
  
  const completedDate = new Date(completedAt);
  const dueDate = new Date(completedDate);
  dueDate.setDate(dueDate.getDate() + validForDays);
  
  return dueDate.toLocaleDateString();
}

function getDaysUntilDue(completedAt: string, validForYears: number | null): number | null {
  if (!validForYears) return null;
  
  const completedDate = new Date(completedAt);
  const dueDate = new Date(completedDate);
  dueDate.setFullYear(dueDate.getFullYear() + validForYears);
  
  const today = new Date();
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

export default async function AuthorisationsDueDatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const resolvedSearchParams = await searchParams;
  const q = (Array.isArray(resolvedSearchParams?.q) ? resolvedSearchParams?.q[0] : resolvedSearchParams?.q) ?? null;

  const completedAuthorisations = await loadCompletedAuthorisationsWithDueDates(q);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Authorisation Due Dates</h1>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Completed Authorisations</h2>
        <form method="get" action="/app/admin/authorisations" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, authorisation, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      <div className="rounded-xl border bg-white p-4">
        {completedAuthorisations.length === 0 ? (
          <p className="text-sm text-gray-600">
            {q ? "No completed authorisations found matching your search." : "No completed authorisations found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Trainee</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Authorisation</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Completed</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Due Date</th>
                  <th className="border-b px-4 py-2 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedAuthorisations.map((auth) => {
                  const completedDate = new Date(auth.completed_at).toLocaleDateString();
                  const dueDate = calculateDueDate(auth.completed_at, auth.valid_for_years);
                  const daysUntilDue = getDaysUntilDue(auth.completed_at, auth.valid_for_years);
                  
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
                      <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.authorisation_title}</div>
                        <div className="text-xs text-gray-500">
                          Valid for: {auth.valid_for_years ? `${auth.valid_for_years} year${auth.valid_for_years > 1 ? 's' : ''}` : 'No expiry'}
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
