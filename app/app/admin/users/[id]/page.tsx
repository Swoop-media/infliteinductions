
// app/app/admin/users/[id]/page.tsx
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

const DEPARTMENTS = [
  "Skydive Franz",
  "Skydive Mt Cook",
  "Skydive Abel Tasman",
  "Helitranz",
  "Engineering",
  "Mt Cook Skiplanes and Helicopters",
  "Franz and Fox Helicopters",
];

const JOBS = [
  "Front of house",
  "Ground crew",
  "Tandem master",
  "Camera flyer",
  "Driver",
  "Packer",
  "Helicopter pilot",
  "Fixed wing pilot",
  "Engineer",
];

type CompletedCourse = {
  assignment_id: string;
  course_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: string;
  days_until_expiry: number;
  status: 'current' | 'expiring_soon' | 'expired';
};

type CompletedAuthorization = {
  assignment_id: string;
  authorization_title: string;
  completed_at: string;
  valid_for_years: number | null;
  due_date: string | null;
  days_until_expiry: number | null;
  status: 'current' | 'expiring_soon' | 'expired' | 'no_expiry';
};

async function loadUserCompletedItems(userId: string) {
  const supabase = await createSupabaseServer();

  // Get completed courses with due dates
  const { data: completedCourses } = await supabase
    .from("course_assignments")
    .select(`
      id,
      completed_at,
      courses!inner(title, valid_for_days)
    `)
    .eq("user_id", userId)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  // Get completed authorizations with due dates
  const { data: completedAuthorizations } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      completed_at,
      authorisations!inner(title, valid_for_years)
    `)
    .eq("user_id", userId)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  // Process courses
  const processedCourses: CompletedCourse[] = (completedCourses || []).map(course => {
    const completedDate = new Date(course.completed_at);
    const validForDays = course.courses.valid_for_days || 365; // Default to 1 year
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);
    
    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 30) status = 'expiring_soon';

    return {
      assignment_id: course.id,
      course_title: course.courses.title,
      completed_at: course.completed_at,
      valid_for_days: validForDays,
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  // Process authorizations
  const processedAuthorizations: CompletedAuthorization[] = (completedAuthorizations || []).map(auth => {
    const completedDate = new Date(auth.completed_at);
    const validForYears = auth.authorisations.valid_for_years;
    
    if (!validForYears) {
      return {
        assignment_id: auth.id,
        authorization_title: auth.authorisations.title,
        completed_at: auth.completed_at,
        valid_for_years: null,
        due_date: null,
        days_until_expiry: null,
        status: 'no_expiry'
      };
    }

    const dueDate = new Date(completedDate);
    dueDate.setFullYear(dueDate.getFullYear() + validForYears);
    
    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 90) status = 'expiring_soon'; // 3 months for authorizations

    return {
      assignment_id: auth.id,
      authorization_title: auth.authorisations.title,
      completed_at: auth.completed_at,
      valid_for_years: validForYears,
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  return { processedCourses, processedAuthorizations };
}

function getStatusColor(status: string) {
  switch (status) {
    case 'current': return 'text-green-600 bg-green-50';
    case 'expiring_soon': return 'text-yellow-600 bg-yellow-50';
    case 'expired': return 'text-red-600 bg-red-50';
    case 'no_expiry': return 'text-blue-600 bg-blue-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

function getStatusText(status: string, daysUntilExpiry: number | null) {
  switch (status) {
    case 'current': 
      return daysUntilExpiry ? `${daysUntilExpiry} days remaining` : 'Current';
    case 'expiring_soon': 
      return daysUntilExpiry ? `Expires in ${daysUntilExpiry} days` : 'Expiring soon';
    case 'expired': 
      return daysUntilExpiry ? `Expired ${Math.abs(daysUntilExpiry)} days ago` : 'Expired';
    case 'no_expiry': 
      return 'No expiry';
    default: 
      return 'Unknown';
  }
}

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", resolvedParams.id)
    .maybeSingle();

  const ok =
    (Array.isArray(resolvedSearchParams?.ok) ? resolvedSearchParams?.ok[0] : resolvedSearchParams?.ok) ?? null;
  const error =
    (Array.isArray(resolvedSearchParams?.error)
      ? resolvedSearchParams?.error[0]
      : resolvedSearchParams?.error) ?? null;

  if (!profile) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">User not found</h1>
        <Link className="text-sm underline" href="/app/admin?tab=users">
          ← Back to Users
        </Link>
      </div>
    );
  }

  const { processedCourses, processedAuthorizations } = await loadUserCompletedItems(resolvedParams.id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit User</h1>
        <Link className="text-sm underline" href="/app/admin?tab=users">
          ← Back to Users
        </Link>
      </div>

      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Saved.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Profile Form */}
        <div className="space-y-6">
          <form
            action="/app/app/admin/users/update"
            method="post"
            className="space-y-4 rounded-lg border bg-white p-4"
          >
            <h2 className="text-lg font-medium">Profile Information</h2>
            <input type="hidden" name="user_id" value={profile.id} />

            <div className="grid gap-1">
              <label className="text-sm font-medium">Full name</label>
              <input
                name="full_name"
                defaultValue={profile.full_name ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Email</label>
              <input
                disabled
                value={profile.email ?? ""}
                className="rounded-md border bg-gray-50 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Department</label>
              <select
                name="department"
                defaultValue={profile.department ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Job description</label>
              <select
                name="job_description"
                defaultValue={profile.job_description ?? ""}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {JOBS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button className="rounded-md bg-black px-3 py-2 text-sm text-white">Save</button>
              <Link href="/app/admin?tab=users" className="rounded-md border px-3 py-2 text-sm">
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Right Column - Completed Items */}
        <div className="space-y-6">
          {/* Completed Courses */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Completed Courses ({processedCourses.length})</h2>
            {processedCourses.length === 0 ? (
              <p className="text-sm text-gray-500">No completed courses found.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {processedCourses.map((course) => (
                  <div key={course.assignment_id} className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{course.course_title}</h3>
                      <p className="text-xs text-gray-600">
                        Completed: {new Date(course.completed_at).toLocaleDateString()}
                      </p>
                      {course.due_date && (
                        <p className="text-xs text-gray-600">
                          Due: {new Date(course.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="ml-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(course.status)}`}>
                        {getStatusText(course.status, course.days_until_expiry)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed Authorizations */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Completed Authorizations ({processedAuthorizations.length})</h2>
            {processedAuthorizations.length === 0 ? (
              <p className="text-sm text-gray-500">No completed authorizations found.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {processedAuthorizations.map((auth) => (
                  <div key={auth.assignment_id} className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{auth.authorization_title}</h3>
                      <p className="text-xs text-gray-600">
                        Completed: {new Date(auth.completed_at).toLocaleDateString()}
                      </p>
                      {auth.due_date && (
                        <p className="text-xs text-gray-600">
                          Due: {new Date(auth.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="ml-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(auth.status)}`}>
                        {getStatusText(auth.status, auth.days_until_expiry)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
