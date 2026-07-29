// @ts-nocheck
// app/app/myprofile/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import TestMessageButton from "./TestMessageButton";
import CollapsibleSection from "./_components/CollapsibleSection";
import RetakeButton from "./_components/RetakeButton";


/* ---------------- Types ---------------- */
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  job_description?: string | null;
};

type EnrolRow = {
  course_id: string;
  status: string;
  updated_at?: string | null;
};

type CourseRow = {
  id: string;
  title: string | null;
  status?: "draft" | "published" | "archived";
  updated_at?: string | null;
};

/* ------------- Data loader ------------- */
async function loadMyProfileAndLearning() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login");

  // Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", user.id)
    .maybeSingle();

  // Fetch all course assignments for this user as trainee
  const { data: allAssignments, error: assignmentError } = await supabase
    .from("course_assignments")
    .select(`
      id,
      course_id,
      assignment_status,
      completed_at,
      courses!course_assignments_course_id_fkey(
        id,
        title,
        status
      )
    `)
    .eq("user_id", user.id)
    .eq("role", "trainee")
    .order("created_at", { ascending: false });
  
  // Fetch onsite trainer and assessor assignments
  const { data: onsiteAssignments } = await supabase
    .from("course_assignments")
    .select(`
      id,
      course_id,
      assignment_status,
      assigned_at,
      role,
      courses!course_assignments_course_id_fkey(
        id,
        title,
        status
      )
    `)
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"])
    .order("assigned_at", { ascending: false });

  if (assignmentError) {
    console.error('Assignment fetch error:', assignmentError);
  }
  console.log('All course assignments:', allAssignments);

  // Fetch all authorization assignments for this user
  const { data: allAuthAssignments } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      authorisation_id,
      assignment_status,
      completed_at,
      approved_at,
      restrictions,
      authorisations!inner(
        id,
        title,
        status
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Debug: Log authorization assignments to see the structure
  console.log('Authorization assignments:', allAuthAssignments);
  console.log('All course assignments:', allAssignments);

  // For each authorization, fetch its courses and the user's progress
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
        .eq("user_id", user.id)
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

  // Debug: Log authWithCourses to see the structure
  console.log('Authorization with courses:', authWithCourses);

  // Split assignments into in progress and completed
  const inProgressCourses = (allAssignments ?? []).filter(a => 
    a.assignment_status === "assigned" || a.assignment_status === "in_progress"
  );
  const completedCourses = (allAssignments ?? []).filter(a => 
    a.assignment_status === "completed"
  );

  const inProgressAuth = (authWithCourses ?? []).filter(a => 
    a.assignment_status === "assigned" || a.assignment_status === "in_progress"
  );
  // This is the section that needs to be updated to filter for 'completed' status correctly
  const completedAuth = (authWithCourses ?? []).filter(a => 
    a.assignment_status === "completed"
  );

  // While a retake is in progress, the user's previous (still in-date)
  // authorisation is preserved in authorisation_assignment_history.
  // Keep showing it as current until the retake is approved.
  let retakePendingAuth: any[] = [];
  try {
    const inProgressAuthIds = inProgressAuth.map((a: any) => a.authorisation_id);
    if (inProgressAuthIds.length > 0) {
      const { data: historyRows } = await supabaseAdmin()
        .from("authorisation_assignment_history")
        .select("assignment_id, authorisation_id, completed_at, approved_at, restrictions, expires_at, superseded_at")
        .eq("user_id", user.id)
        .eq("reason", "retake")
        .in("authorisation_id", inProgressAuthIds)
        .order("superseded_at", { ascending: false });

      // Latest snapshot per assignment (rows are reused across retakes, so
      // matching on assignment_id ties the snapshot to the current record)
      const latestByAssignment = new Map<string, any>();
      for (const row of historyRows ?? []) {
        if (!latestByAssignment.has(row.assignment_id)) latestByAssignment.set(row.assignment_id, row);
      }

      retakePendingAuth = inProgressAuth
        .map((a: any) => {
          const snap = latestByAssignment.get(a.id);
          if (!snap) return null;
          // Only show a snapshot from the CURRENT retake cycle: once the
          // assignment is re-approved (approved_at after the snapshot), or the
          // snapshot predates the last approval, it is stale.
          if (a.approved_at && new Date(a.approved_at) > new Date(snap.superseded_at)) return null;
          return {
            ...a,
            id: `${a.id}-prior`,
            completed_at: snap.completed_at,
            restrictions: snap.restrictions,
            prior_expires_at: snap.expires_at,
            retake_in_progress: true,
          };
        })
        .filter(Boolean);
    }
  } catch (e) {
    console.error("Error loading retake history snapshots:", e);
  }

  // Debug: Log filtered results
  console.log('In progress courses:', inProgressCourses);
  console.log('Completed courses:', completedCourses);
  console.log('In progress auth:', inProgressAuth);
  console.log('Completed auth:', completedAuth);

  const { data: noticeAssignments, error: noticeAssignErr } = await supabase
    .from("operations_notice_assignments")
    .select("id, notice_id, user_id, created_at")
    .eq("user_id", user.id);
  
  if (noticeAssignErr) {
    console.error("Error fetching notice assignments:", noticeAssignErr);
  }

  const assignedNoticeIds = (noticeAssignments ?? []).map((a) => a.notice_id);

  let operationsNotices: any[] = [];
  if (assignedNoticeIds.length > 0) {
    const { data: notices } = await supabase
      .from("operations_notices")
      .select("*")
      .in("id", assignedNoticeIds)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    const { data: acknowledgements } = await supabase
      .from("operations_notice_acknowledgements")
      .select("notice_id, acknowledged_at")
      .eq("user_id", user.id);

    const ackMap = new Map(
      (acknowledgements ?? []).map((a) => [a.notice_id, a.acknowledged_at])
    );

    const assignmentMap = new Map(
      (noticeAssignments ?? []).map((a) => [a.notice_id, a])
    );

    operationsNotices = (notices ?? []).map((notice) => {
      const assignment = assignmentMap.get(notice.id);
      const acknowledgedAt = ackMap.get(notice.id);

      let expiryDate: Date | null = null;
      let isExpired = false;
      if (notice.valid_for_days && notice.created_at) {
        expiryDate = new Date(notice.created_at);
        expiryDate.setDate(expiryDate.getDate() + notice.valid_for_days);
        isExpired = expiryDate < new Date();
      }

      return {
        ...notice,
        assignedAt: assignment?.created_at || null,
        acknowledgedAt: acknowledgedAt || null,
        expiryDate,
        isExpired,
        isValid: !isExpired,
      };
    }).filter((n) => !n.isExpired);
  }

  return { 
    profile, 
    inProgressCourses, 
    completedCourses, 
    inProgressAuth,
    completedAuth,
    retakePendingAuth,
    onsiteAssignments: onsiteAssignments || [],
    operationsNotices
  };
}

/* ---------------- UI helpers ---------------- */
function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "blue" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ---------------- Page ---------------- */
export default async function MyProfilePage() {
  const { profile, inProgressCourses, completedCourses, inProgressAuth, completedAuth, retakePendingAuth, onsiteAssignments, operationsNotices } = await loadMyProfileAndLearning();
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  // Check for existing Teams link
  const { data: teamsLink } = await supabase
    .from("teams_links")
    .select("teams_user_id, last_activity")
    .eq("user_id", user.id)
    .maybeSingle();

  // Check for existing link code
  const { data: linkCode } = await supabase
    .from("teams_link_codes")
    .select("code, expires_at")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My profile</h1>
          {profile ? (
            <p className="text-sm text-gray-600">
              {profile.full_name ?? ""} {profile.email ? `• ${profile.email}` : ""}
              {profile.department ? ` • ${profile.department}` : ""}
              {profile.job_description ? ` • ${profile.job_description}` : ""}
            </p>
          ) : (
            <p className="text-sm text-gray-600">No profile details.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/myprofile/documents"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            My documents
          </Link>
        </div>
      </div>

      {/* Operations Notices and Teams Integration - Side by Side */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* Operations Notices */}
        <Link
          href="/app/operations-notices"
          className="rounded-xl border bg-white p-4 hover:bg-gray-50"
        >
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Operations Notices</div>
            <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-medium">
              {operationsNotices.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {operationsNotices.length === 0 
              ? "No operations notices assigned to you."
              : `${operationsNotices.filter((n: any) => n.require_acknowledgement && !n.acknowledgedAt).length} pending acknowledgement`
            }
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-sm underline">
            View notices →
          </div>
        </Link>

        {/* Teams Integration */}
        <div className="rounded-xl border bg-white p-4">
          <div className="text-lg font-semibold">Teams Integration</div>
          {teamsLink ? (
            <div className="mt-1">
              <p className="text-sm text-green-600">✅ Teams account linked</p>
              <p className="text-xs text-gray-500 mt-1">
                Last activity: {new Date(teamsLink.last_activity).toLocaleDateString()}
              </p>
              <div className="mt-3 flex gap-2">
                <a 
                  href="https://teams.microsoft.com/l/chat/0/0?users=28:dc8a23c4-a57f-4e10-8543-05397e1b4ae3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                >
                  Open Teams Chat
                </a>
                <TestMessageButton userId={user.id} />
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-sm text-gray-600">
                Link your Teams account for notifications.
              </p>
              {linkCode ? (
                <div className="mt-2">
                  <div className="text-sm">
                    Code: <code className="ml-1 px-2 py-0.5 bg-gray-100 rounded font-mono">{linkCode.code}</code>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Send "link {linkCode.code}" to the bot in Teams
                  </p>
                  <a
                    href={`https://teams.microsoft.com/l/chat/0/0?users=28:dc8a23c4-a57f-4e10-8543-05397e1b4ae3&message=${encodeURIComponent(`link ${linkCode.code}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                  >
                    Open the bot in Teams
                  </a>
                </div>
              ) : (
                <form action={async () => {
                  "use server";
                  const supabase = await createSupabaseServer();
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
                  await supabase.from("teams_link_codes").delete().eq("user_id", user.id);
                  await supabase.from("teams_link_codes").insert({
                    user_id: user.id,
                    code,
                    expires_at: expiresAt.toISOString()
                  });
                  revalidatePath("/app/myprofile");
                }}>
                  <button 
                    type="submit"
                    className="mt-3 inline-flex items-center gap-1 text-sm underline"
                  >
                    Generate link code →
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Quick links */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/myprofile/documents"
          className="rounded-xl border bg-white p-4 hover:bg-gray-50"
        >
          <div className="text-lg font-semibold">My documents</div>
          <p className="mt-1 text-sm text-gray-600">
            View and download documents you’ve uploaded (e.g., licence, medical).
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-sm underline">
            Open documents →
          </div>
        </Link>

        {/* Placeholder for future settings or certificates list */}
        <div className="rounded-xl border bg-white p-4">
          <div className="text-lg font-semibold">Profile settings</div>
          <p className="mt-1 text-sm text-gray-600">Coming soon: update personal details.</p>
        </div>
      </section>

      {/* My learning */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: In Progress */}
        <div className="space-y-6">
          {/* In Progress Authorizations */}
          <CollapsibleSection
            title="In Progress Authorizations"
            count={inProgressAuth.length}
            defaultCollapsed={true}
            pillTone="blue"
          >
            {inProgressAuth.length === 0 ? (
              <p className="text-sm text-gray-500">No authorizations in progress.</p>
            ) : (
              <div className="space-y-3">
                {inProgressAuth.map((assignment: any) => {
                  const auth = assignment.authorisations;
                  const completedCoursesCount = assignment.courses.filter((c: any) => 
                    c.assignment?.assignment_status === "completed"
                  ).length;
                  const totalCourses = assignment.courses.length;

                  return (
                    <div key={assignment.id} className="flex items-center justify-between rounded-lg border p-4 bg-purple-50">
                      <div className="flex-1">
                        <h3 className="font-medium">{auth.title}</h3>
                        <p className="text-sm text-gray-600 capitalize">
                          {assignment.assignment_status === 'pending_approval' 
                            ? 'Pending Approval' 
                            : assignment.assignment_status.replace('_', ' ')
                          }
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {completedCoursesCount} of {totalCourses} courses completed
                        </p>
                        {assignment.courses.filter((c: any) => c.assignment?.assignment_status === "completed").length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-green-600 font-medium">Completed:</p>
                            {assignment.courses
                              .filter((c: any) => c.assignment?.assignment_status === "completed")
                              .map((c: any) => (
                                <p key={c.course_id} className="text-xs text-green-600">
                                  ✓ {c.courses.title}
                                </p>
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/app/learn/authorisations/${assignment.authorisation_id}`}
                          className="rounded-md bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700"
                        >
                          Continue
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>

          {/* In Progress Courses */}
          <CollapsibleSection
            title="In Progress Courses"
            count={inProgressCourses.length}
            defaultCollapsed={true}
            pillTone="blue"
          >
            {inProgressCourses.length === 0 ? (
              <p className="text-sm text-gray-500">
                No individual courses in progress. Visit <Link href="/app/courses" className="underline">Courses</Link> to enrol.
              </p>
            ) : (
              inProgressCourses.map((assignment: any) => {
                const course = assignment.courses;
                return (
                  <div key={assignment.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <h3 className="font-medium">{course.title}</h3>
                      <p className="text-sm text-gray-600 capitalize">
                        {assignment.assignment_status.replace('_', ' ')}
                      </p>
                    </div>
                    <Link
                      href={`/app/learn/courses/${course.id}`}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                    >
                      Continue
                    </Link>
                  </div>
                );
              })
            )}
          </CollapsibleSection>
        </div>

        {/* Right Column: Completed */}
        <div className="space-y-6">
          {/* Completed Authorizations */}
          <CollapsibleSection
            title="Completed Authorizations"
            count={completedAuth.length + retakePendingAuth.length}
            defaultCollapsed={true}
            pillTone="green"
          >
            {completedAuth.length + retakePendingAuth.length === 0 ? (
              <p className="text-sm text-gray-500">No completed authorizations yet.</p>
            ) : (
              <div className="space-y-3">
                {[...retakePendingAuth, ...completedAuth].map((assignment: any) => {
                  const auth = assignment.authorisations;
                  const totalCourses = assignment.courses?.length || 0;

                  return (
                    <div key={assignment.id} className="rounded-lg border p-4 bg-green-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium">{auth?.title || 'Untitled Authorization'}</h3>
                          <p className="text-sm text-gray-600">
                            Completed {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString() : 'Recently'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            All {totalCourses} courses completed
                          </p>

                          {assignment.restrictions && (
                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-3 py-2">
                              <span className="font-semibold">Restrictions:</span> {assignment.restrictions}
                            </div>
                          )}

                          {assignment.courses.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-600 font-medium">Courses completed:</p>
                              <div className="ml-2 space-y-1">
                                {assignment.courses.map((c: any) => (
                                  <div key={c.course_id} className="flex items-center gap-1">
                                    <span className="text-green-600 text-xs">✓</span>
                                    <Link
                                      href={`/app/learn/courses/${c.course_id}`}
                                      className="text-xs text-blue-600 hover:underline"
                                    >
                                      {c.courses.title}
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Pill tone="green">Completed</Pill>
                          {assignment.retake_in_progress ? (
                            <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                              Retake in progress
                            </span>
                          ) : (
                            <RetakeButton 
                              type="authorization" 
                              authorizationId={assignment.authorisation_id}
                              authTitle={auth?.title}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>

          {/* Completed Courses */}
          <CollapsibleSection
            title="Completed Courses"
            count={completedCourses.length}
            defaultCollapsed={true}
            pillTone="green"
          >
            {completedCourses.length === 0 ? (
              <p className="text-sm text-gray-500">No completed individual courses yet.</p>
            ) : (
              completedCourses.map((assignment: any) => {
                const course = assignment.courses;
                return (
                  <div key={assignment.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <h3 className="font-medium">{course?.title ?? "Untitled"}</h3>
                      <p className="text-sm text-gray-600">
                        Completed {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString() : 'Recently'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone="green">Completed</Pill>
                      <Link
                        href={`/app/learn/courses/${course?.id}`}
                        className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <RetakeButton 
                        type="course" 
                        courseId={course?.id}
                        courseTitle={course?.title}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CollapsibleSection>
        </div>
      </div>

      {/* Onsite Training Assignments */}
      {onsiteAssignments.length > 0 && (
        <CollapsibleSection
          title="Onsite Training Assignments"
          count={onsiteAssignments.length}
          defaultCollapsed={false}
          pillTone="blue"
        >
          <div className="space-y-4">
            {/* Onsite Trainer Assignments */}
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
            
            {/* Onsite Assessor Assignments */}
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
        </CollapsibleSection>
      )}

    </div>
  );
}