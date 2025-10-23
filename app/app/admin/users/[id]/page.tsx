// @ts-nocheck
// app/app/admin/users/[id]/page.tsx
// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PDFExportButton } from "./PDFExportButton";
import { DocumentViewButton } from "./DocumentViewButton";
import ExpandableCourseDetails from "./ExpandableCourseDetails";
import AdminRetakeButton from "./AdminRetakeButton";
import UserNotifications from "./UserNotifications";



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

// Raw types from Supabase query results
type CourseAssignmentWithCourse = {
  id: any;
  course_id: any;
  completed_at: any;
  courses: {
    title: any;
    valid_for_days: any;
  };
};

type CompletedCourse = {
  assignment_id: string;
  course_id: string;
  course_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: string;
  days_until_expiry: number;
  status: 'current' | 'expiring_soon' | 'expired';
};

type AuthorizationAssignmentWithDetails = {
  id: any;
  authorisation_id: any;
  assignment_status: any;
  completed_at: any;
  authorisations: {
    id: any;
    title: any;
    status: any;
    valid_for_days: any;
  };
  courses?: any[];
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

async function loadUserAssignmentsAndAvailable(userId: string) {
  const supabase = await createSupabaseServer();

  // Get all course assignments (both completed and in-progress)
  const { data: allCourseAssignments } = await supabase
    .from("course_assignments")
    .select(`
      id,
      course_id,
      assignment_status,
      assigned_at,
      completed_at,
      role,
      courses!course_assignments_course_id_fkey(id, title, valid_for_days, status)
    `)
    .eq("user_id", userId)
    .eq("role", "trainee")
    .order("assigned_at", { ascending: false });

  // Get onsite trainer and assessor assignments
  const { data: onsiteAssignments } = await supabase
    .from("course_assignments")
    .select(`
      id,
      assignment_status,
      assigned_at,
      role,
      courses!course_assignments_course_id_fkey(id, title, status)
    `)
    .eq("user_id", userId)
    .in("role", ["onsite_trainer", "onsite_assessor"])
    .order("assigned_at", { ascending: false });

  // Get completed courses for backwards compatibility
  const completedCourses = allCourseAssignments?.filter(assignment => 
    assignment.assignment_status === "completed" && assignment.completed_at
  ) || [];

  // Get all authorization assignments (both completed and in-progress) 
  const { data: allAuthAssignments, error: authError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      authorisation_id,
      assignment_status,
      created_at,
      completed_at,
      authorisations!inner(
        id,
        title,
        status,
        valid_for_days
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Get available courses for assignment (published courses not already assigned to this user)
  const assignedCourseIds = (allCourseAssignments || []).map(a => a.courses?.id).filter(Boolean);
  let availableCoursesQuery = supabase
    .from("courses")
    .select("id, title, status")
    .eq("status", "published");
  
  if (assignedCourseIds.length > 0) {
    availableCoursesQuery = availableCoursesQuery.not("id", "in", `(${assignedCourseIds.map(id => `"${id}"`).join(',')})`);
  }
  
  const { data: availableCourses } = await availableCoursesQuery.order("title");

  // Get available authorizations for assignment (active auths not already assigned to this user)
  const assignedAuthIds = (allAuthAssignments || []).map(a => a.authorisation_id).filter(Boolean);
  let availableAuthsQuery = supabase
    .from("authorisations")
    .select("id, title, status")
    .eq("status", "active");
    
  if (assignedAuthIds.length > 0) {
    availableAuthsQuery = availableAuthsQuery.not("id", "in", `(${assignedAuthIds.map(id => `"${id}"`).join(',')})`);
  }
  
  const { data: availableAuthorizations } = await availableAuthsQuery.order("title");

  // Get uploaded documents
  const { data: uploadedDocuments } = await supabase
    .from("learner_documents")
    .select(`
      id,
      title,
      file_path,
      expires_on,
      created_at,
      courses!learner_documents_course_id_fkey(title),
      course_modules!learner_documents_module_id_fkey(title)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Remove the old duplicate auth assignments query since we have it above


  if (authError) {
    console.error('Authorization assignments error:', authError);
  }

  // For each authorization, fetch its courses and the user's progress (like MyProfile does)
  const authWithCourses = await Promise.all(
    (allAuthAssignments ?? []).map(async (authAssignment) => {
      // Get courses for this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select(`
          course_id,
          order_index,
          courses!inner(
            id,
            title,
            status
          )
        `)
        .eq("authorisation_id", authAssignment.authorisation_id)
        .order("order_index", { ascending: true });

      // Get user's course assignments for these courses
      const courseIds = (authCourses ?? []).map(ac => ac.course_id);
      const { data: userCourseAssignments } = courseIds.length > 0 ? await supabase
        .from("course_assignments")
        .select("course_id, assignment_status, completed_at")
        .eq("user_id", userId)
        .eq("role", "trainee")
        .in("course_id", courseIds) : { data: [] };

      const courseAssignmentMap = new Map(
        (userCourseAssignments ?? []).map(ca => [ca.course_id, ca])
      );

      return {
        ...authAssignment,
        courses: (authCourses ?? []).map(ac => ({
          ...ac,
          assignment: courseAssignmentMap.get(ac.course_id)
        }))
      };
    })
  );

  // Debug logging

  // Filter completed authorizations - ensure we're checking the right status
  const completedAuthWithCourses = authWithCourses?.filter(auth => 
    auth.assignment_status === "completed" && auth.completed_at
  ) || [];


  // Process courses
  const processedCourses: CompletedCourse[] = (completedCourses || []).map((course: any) => {
    const completedDate = new Date(course.completed_at);
    const validForDays = course.courses?.valid_for_days || 365; // Default to 1 year
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 30) status = 'expiring_soon';

    return {
      assignment_id: course.id,
      course_id: course.course_id, // Add the actual course_id
      course_title: course.courses?.title || 'Unknown Course',
      completed_at: course.completed_at,
      valid_for_days: validForDays,
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  // Process authorizations using the MyProfile pattern
  const processedAuthorizations: CompletedAuthorization[] = (completedAuthWithCourses || []).map((auth: any) => {
    const completedDate = new Date(auth.completed_at);
    const validForDays = auth.authorisations?.valid_for_days;

    // If no valid_for_days, treat as no expiry
    if (!validForDays) {
      return {
        assignment_id: auth.id,
        authorization_title: auth.authorisations?.title || 'Unknown Authorization',
        completed_at: auth.completed_at,
        valid_for_years: null,
        due_date: null,
        days_until_expiry: null,
        status: 'no_expiry'
      };
    }

    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 90) status = 'expiring_soon'; // 3 months for authorizations

    return {
      assignment_id: auth.id,
      authorization_title: auth.authorisations?.title || 'Unknown Authorization',
      completed_at: auth.completed_at,
      valid_for_years: Math.round(validForDays / 365 * 100) / 100, // Convert days to years for display
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  return { 
    processedCourses, 
    processedAuthorizations, 
    uploadedDocuments: uploadedDocuments || [],
    allCourseAssignments: allCourseAssignments || [],
    allAuthAssignments: allAuthAssignments || [],
    onsiteAssignments: onsiteAssignments || [],
    availableCourses: availableCourses || [],
    availableAuthorizations: availableAuthorizations || []
  };
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

  const { 
    processedCourses, 
    processedAuthorizations, 
    uploadedDocuments, 
    allCourseAssignments, 
    allAuthAssignments, 
    onsiteAssignments,
    availableCourses, 
    availableAuthorizations 
  } = await loadUserAssignmentsAndAvailable(resolvedParams.id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit User</h1>
        <div className="flex items-center gap-3">
          <PDFExportButton userId={resolvedParams.id} userName={profile.full_name || profile.email || "Unknown"} />
          <Link className="text-sm underline" href="/app/admin?tab=users">
            ← Back to Users
          </Link>
        </div>
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
            action="/app/admin/users/update"
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
          
          {/* Notifications */}
          <UserNotifications userId={resolvedParams.id} />
          
          {/* Onsite Training Assignments */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Onsite Training Assignments</h2>
            {onsiteAssignments.length === 0 ? (
              <p className="text-sm text-gray-500">No onsite assignments found.</p>
            ) : (
              <div className="space-y-3">
                {onsiteAssignments.filter(assignment => assignment.role === 'onsite_trainer').length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Onsite Trainer For:</h3>
                    <div className="space-y-2">
                      {onsiteAssignments
                        .filter(assignment => assignment.role === 'onsite_trainer')
                        .map(assignment => (
                          <div key={assignment.id} className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-md">
                            <div>
                              <span className="text-sm font-medium text-blue-900">
                                {assignment.courses?.title || 'Unknown Course'}
                              </span>
                              <span className="text-xs text-blue-700 ml-2">
                                (Assigned: {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : 'N/A'})
                              </span>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              assignment.assignment_status === 'completed' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {assignment.assignment_status || 'assigned'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                
                {onsiteAssignments.filter(assignment => assignment.role === 'onsite_assessor').length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Onsite Assessor For:</h3>
                    <div className="space-y-2">
                      {onsiteAssignments
                        .filter(assignment => assignment.role === 'onsite_assessor')
                        .map(assignment => (
                          <div key={assignment.id} className="flex items-center justify-between py-2 px-3 bg-purple-50 rounded-md">
                            <div>
                              <span className="text-sm font-medium text-purple-900">
                                {assignment.courses?.title || 'Unknown Course'}
                              </span>
                              <span className="text-xs text-purple-700 ml-2">
                                (Assigned: {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : 'N/A'})
                              </span>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              assignment.assignment_status === 'completed' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-purple-100 text-purple-700'
                            }`}>
                              {assignment.assignment_status || 'assigned'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Assignment Management & Completed Items */}
        <div className="space-y-6">
          {/* Completed Authorizations */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Completed Authorizations ({processedAuthorizations.length})</h2>
            {processedAuthorizations.length === 0 ? (
              <p className="text-sm text-gray-500">No completed authorizations found.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {processedAuthorizations.map((auth) => {
                  // Get the authorization ID from the allAuthAssignments
                  const authAssignment = allAuthAssignments.find(a => a.id === auth.assignment_id);
                  const authorizationId = authAssignment?.authorisation_id;
                  
                  return (
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
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(auth.status)}`}>
                          {getStatusText(auth.status, auth.days_until_expiry)}
                        </span>
                        {authorizationId && (
                          <AdminRetakeButton
                            type="authorization"
                            userId={resolvedParams.id}
                            authorizationId={authorizationId}
                            authTitle={auth.authorization_title}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Authorization Assignments */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Current Authorization Assignments ({allAuthAssignments.length})</h2>
            {allAuthAssignments.length === 0 ? (
              <p className="text-sm text-gray-500">No authorization assignments found.</p>
            ) : (
              <ExpandableCourseDetails 
                authorizations={allAuthAssignments.map(assignment => ({
                  authorization_id: assignment.authorisation_id,
                  authorization_title: assignment.authorisations?.title || 'Unknown Authorization',
                  assignment_status: assignment.assignment_status,
                  completed_at: assignment.completed_at
                }))}
                userId={resolvedParams.id}
                type="authorizations"
              />
            )}
          </div>

          {/* Completed Courses */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Completed Courses ({processedCourses.length})</h2>
            {processedCourses.length === 0 ? (
              <p className="text-sm text-gray-500">No completed courses found.</p>
            ) : (
              <ExpandableCourseDetails 
                courses={processedCourses.map(course => ({
                  course_id: course.course_id,
                  course_title: course.course_title,
                  assignment_status: 'completed',
                  completed_at: course.completed_at
                }))}
                userId={resolvedParams.id}
                type="courses"
              />
            )}
          </div>

          {/* Current Course Assignments */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Current Course Assignments ({allCourseAssignments.length})</h2>
            {allCourseAssignments.length === 0 ? (
              <p className="text-sm text-gray-500">No course assignments found.</p>
            ) : (
              <ExpandableCourseDetails 
                courses={allCourseAssignments.map(assignment => ({
                  course_id: assignment.course_id,
                  course_title: assignment.courses?.title || 'Unknown Course',
                  assignment_status: assignment.assignment_status,
                  completed_at: assignment.completed_at
                }))}
                userId={resolvedParams.id}
                type="courses"
              />
            )}
          </div>

          {/* Uploaded Documents */}
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-lg font-medium mb-4">Uploaded Documents ({uploadedDocuments.length})</h2>
            {uploadedDocuments.length === 0 ? (
              <p className="text-sm text-gray-500">No uploaded documents found.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {uploadedDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-md bg-gray-50">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{doc.title}</h3>
                      <p className="text-xs text-gray-600">
                        Course: {(doc.courses as any)?.title || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Module: {(doc.course_modules as any)?.title || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.expires_on && (
                        <p className="text-xs text-gray-600">
                          Expires: {new Date(doc.expires_on).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="ml-3">
                      <DocumentViewButton filePath={doc.file_path} title={doc.title} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign New Authorizations */}
          {availableAuthorizations.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <h2 className="text-lg font-medium mb-4">Assign Authorizations</h2>
              <form action="/app/admin/users/assign-authorization" method="post" className="space-y-3">
                <input type="hidden" name="user_id" value={profile.id} />
                <div className="space-y-2">
                  {availableAuthorizations.map((auth) => (
                    <label key={auth.id} className="flex items-center">
                      <input
                        type="checkbox"
                        name="authorization_ids"
                        value={auth.id}
                        className="mr-2 rounded border-gray-300"
                      />
                      <span className="text-sm">{auth.title}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Assign Selected Authorizations
                </button>
              </form>
            </div>
          )}

          {/* Assign New Courses */}
          {availableCourses.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <h2 className="text-lg font-medium mb-4">Assign Courses</h2>
              <form action="/app/admin/users/assign-course" method="post" className="space-y-3">
                <input type="hidden" name="user_id" value={profile.id} />
                <div className="space-y-2">
                  {availableCourses.map((course) => (
                    <label key={course.id} className="flex items-center">
                      <input
                        type="checkbox"
                        name="course_ids"
                        value={course.id}
                        className="mr-2 rounded border-gray-300"
                      />
                      <span className="text-sm">{course.title}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Assign Selected Courses
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}