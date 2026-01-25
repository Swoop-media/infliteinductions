// @ts-nocheck

// app/app/admin/authorisations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { calculateAuthorizationExpiry, getDaysUntilExpiry, getExpiryStatus } from "@/lib/utils/calculateAuthorizationExpiry";

export const dynamic = "force-dynamic";

type AuthorisationWithExpiry = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
  authorisation_title: string | null;
  valid_for_days: number | null;
  department: string | null;
  due_date: Date | null;
  days_until_due: number | null;
  expiry_source: string;
};

async function loadCompletedAuthorisationsWithDueDates(q: string | null): Promise<AuthorisationWithExpiry[]> {
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
      authorisations!inner(id, title, valid_for_days, department)
    `)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (q && q.trim()) {
    const searchTerm = `%${q.trim()}%`;
    query = query.or(`profiles.full_name.ilike.${searchTerm},profiles.email.ilike.${searchTerm},authorisations.title.ilike.${searchTerm}`);
  }

  const { data: rows, error } = await query.limit(200);

  if (error) {
    console.log("Authorisation query error:", error);
    return [];
  }

  if (!rows || rows.length === 0) {
    return [];
  }

  const authIds = [...new Set(rows.map((r: any) => r.authorisation_id))];
  const userIds = [...new Set(rows.map((r: any) => r.user_id))];

  const adminClient = supabaseAdmin();

  const { data: authCourses } = await adminClient
    .from("authorisation_courses")
    .select("authorisation_id, course_id")
    .in("authorisation_id", authIds);

  const authCourseMap = new Map<string, string[]>();
  (authCourses || []).forEach((ac: any) => {
    const existing = authCourseMap.get(ac.authorisation_id) || [];
    existing.push(ac.course_id);
    authCourseMap.set(ac.authorisation_id, existing);
  });

  const allCourseIds = [...new Set((authCourses || []).map((ac: any) => ac.course_id))];

  let documents: any[] = [];
  if (allCourseIds.length > 0 && userIds.length > 0) {
    const { data: docs } = await adminClient
      .from("learner_documents")
      .select("id, user_id, course_id, expires_on")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .not("expires_on", "is", null);
    documents = docs || [];
  }

  const userCourseDocMap = new Map<string, any[]>();
  documents.forEach((doc: any) => {
    const key = `${doc.user_id}_${doc.course_id}`;
    const existing = userCourseDocMap.get(key) || [];
    existing.push(doc);
    userCourseDocMap.set(key, existing);
  });

  const { data: courses } = await adminClient
    .from("courses")
    .select("id, valid_for_months")
    .in("id", allCourseIds);

  const courseValidityMap = new Map<string, number | null>();
  (courses || []).forEach((c: any) => {
    courseValidityMap.set(c.id, c.valid_for_months);
  });

  let courseAssignments: any[] = [];
  if (allCourseIds.length > 0 && userIds.length > 0) {
    const { data: assignments } = await adminClient
      .from("course_assignments")
      .select("id, user_id, course_id, completed_at")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .eq("role", "trainee")
      .not("completed_at", "is", null);
    courseAssignments = assignments || [];
  }

  const userCourseAssignmentMap = new Map<string, any>();
  courseAssignments.forEach((ca: any) => {
    const key = `${ca.user_id}_${ca.course_id}`;
    userCourseAssignmentMap.set(key, ca);
  });

  const completedAuthorisations: AuthorisationWithExpiry[] = (rows ?? []).map((row: any) => {
    const authId = row.authorisation_id;
    const userId = row.user_id;
    const completedAt = new Date(row.completed_at);
    const validForDays = row.authorisations?.valid_for_days ?? null;

    const courseIds = authCourseMap.get(authId) || [];
    const userDocs: any[] = [];
    const userCourses: any[] = [];
    
    courseIds.forEach(courseId => {
      const docKey = `${userId}_${courseId}`;
      const docs = userCourseDocMap.get(docKey) || [];
      userDocs.push(...docs);
      
      const validForMonths = courseValidityMap.get(courseId);
      const courseAssignment = userCourseAssignmentMap.get(docKey);
      if (validForMonths && courseAssignment?.completed_at) {
        userCourses.push({
          valid_for_months: validForMonths,
          completed_at: courseAssignment.completed_at
        });
      }
    });

    const expiryDate = calculateAuthorizationExpiry(
      completedAt,
      validForDays,
      userDocs.map(d => ({ expires_on: d.expires_on })),
      userCourses
    );

    let expirySource = "No expiry";
    if (expiryDate) {
      const authExpiryDate = validForDays ? new Date(completedAt.getTime() + validForDays * 24 * 60 * 60 * 1000) : null;
      
      const docExpiryDates = userDocs
        .filter(d => d.expires_on)
        .map(d => new Date(d.expires_on))
        .filter(d => !isNaN(d.getTime()) && d > completedAt);
      
      const earliestDocExpiry = docExpiryDates.length > 0 
        ? new Date(Math.min(...docExpiryDates.map(d => d.getTime())))
        : null;

      const courseExpiryDates = userCourses
        .filter(c => c.valid_for_months && c.completed_at)
        .map(c => {
          const courseExpiry = new Date(c.completed_at);
          courseExpiry.setMonth(courseExpiry.getMonth() + c.valid_for_months);
          return courseExpiry;
        })
        .filter(d => !isNaN(d.getTime()));
      
      const earliestCourseExpiry = courseExpiryDates.length > 0 
        ? new Date(Math.min(...courseExpiryDates.map(d => d.getTime())))
        : null;

      const candidates = [
        { date: earliestDocExpiry, source: "Document expiry" },
        { date: earliestCourseExpiry, source: "Course validity" },
        { date: authExpiryDate, source: `Valid for: ${validForDays} days` }
      ].filter(c => c.date !== null);

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.date!.getTime() - b.date!.getTime());
        expirySource = candidates[0].source;
      }
    }

    const daysUntilDue = expiryDate ? getDaysUntilExpiry(new Date(expiryDate)) : null;

    return {
      assignment_id: row.id,
      user_id: row.user_id,
      authorisation_id: row.authorisation_id,
      completed_at: row.completed_at,
      full_name: row.profiles?.full_name ?? null,
      email: row.profiles?.email ?? null,
      authorisation_title: row.authorisations?.title ?? null,
      valid_for_days: validForDays,
      department: row.authorisations?.department ?? null,
      due_date: expiryDate,
      days_until_due: daysUntilDue,
      expiry_source: expirySource,
    };
  });

  completedAuthorisations.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.getTime() - b.due_date.getTime();
  });

  return completedAuthorisations;
}

function formatDate(date: Date | null): string {
  if (!date) return "No expiry";
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function getStatusDisplay(daysUntilDue: number | null): { color: string; text: string } {
  if (daysUntilDue === null) {
    return { color: "text-gray-500", text: "No expiry" };
  }
  
  if (daysUntilDue < 0) {
    return { color: "text-red-600", text: `Expired (${Math.abs(daysUntilDue)} days ago)` };
  } else if (daysUntilDue <= 30) {
    return { color: "text-yellow-600", text: `${daysUntilDue} days remaining` };
  } else {
    return { color: "text-green-600", text: `${daysUntilDue} days remaining` };
  }
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
        <div>
          <h1 className="text-2xl font-bold">Authorisation Due Dates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {completedAuthorisations.length} total authorisations (sorted by expiry date)
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      <form method="get" action="/app/admin/authorisations" className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, email, document, course, or module..."
          className="w-80 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
      </form>

      <div className="rounded-xl border bg-white overflow-hidden">
        {completedAuthorisations.length === 0 ? (
          <p className="text-sm text-gray-600 p-4">
            {q ? "No completed authorisations found matching your search." : "No completed authorisations found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Trainee</th>
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Authorisation</th>
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Department</th>
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Approved</th>
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Due Date</th>
                  <th className="border-b px-4 py-3 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedAuthorisations.map((auth) => {
                  const completedDate = formatDate(new Date(auth.completed_at));
                  const dueDate = formatDate(auth.due_date);
                  const { color, text } = getStatusDisplay(auth.days_until_due);

                  return (
                    <tr key={auth.assignment_id} className="hover:bg-gray-50">
                      <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.full_name ?? "Unknown"}</div>
                        <div className="text-xs text-gray-500">{auth.email}</div>
                      </td>
                      <td className="border-b px-4 py-3">
                        <div className="font-medium">{auth.authorisation_title}</div>
                        <div className="text-xs text-gray-500">{auth.expiry_source}</div>
                      </td>
                      <td className="border-b px-4 py-3 text-sm">{auth.department || "-"}</td>
                      <td className="border-b px-4 py-3 text-sm">{completedDate}</td>
                      <td className="border-b px-4 py-3 text-sm">{dueDate}</td>
                      <td className={`border-b px-4 py-3 text-sm font-medium ${color}`}>
                        {text}
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
