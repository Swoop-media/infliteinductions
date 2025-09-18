// @ts-nocheck
// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

type Props = {
  params: Promise<{ assignmentId: string }>;
};

async function loadAssignmentDetails(assignmentId: string) {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();

  // Get the authorisation assignment details
  const { data: assignment, error: assignError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      assignment_status,
      completed_at,
      authorisations!inner(
        id,
        title,
        description
      )
    `)
    .eq("id", assignmentId)
    .single();

  if (assignError) throw new Error(assignError.message);
  if (!assignment) throw new Error("Assignment not found");

  // Get user profile separately to avoid relationship ambiguity
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", assignment.user_id)
    .single();

  if (profileError) throw new Error(profileError.message);

  // Get all courses for this authorisation
  const { data: authCourses, error: coursesError } = await supabase
    .from("authorisation_courses")
    .select(`
      course_id,
      order_index,
      courses!inner(
        id,
        title,
        description
      )
    `)
    .eq("authorisation_id", assignment.authorisation_id)
    .order("order_index", { ascending: true });

  if (coursesError) throw new Error(coursesError.message);

  const courseIds = (authCourses || []).map(ac => ac.course_id);

  // Get user's course assignments for these courses
  const { data: courseAssignments, error: courseAssignError } = await supabase
    .from("course_assignments")
    .select("id, course_id, assignment_status, completed_at")
    .eq("user_id", assignment.user_id)
    .eq("role", "trainee")
    .in("course_id", courseIds);

  if (courseAssignError) throw new Error(courseAssignError.message);

  // Map course assignments by course_id
  const courseAssignmentMap = new Map(
    (courseAssignments || []).map(ca => [ca.course_id, ca])
  );

  // Combine course info with assignment status
  const coursesWithProgress = (authCourses || []).map(ac => ({
    ...ac,
    assignment: courseAssignmentMap.get(ac.course_id)
  }));

  return {
    assignment,
    profile,
    courses: coursesWithProgress
  };
}

// This function is intended to handle the approval of an authorisation assignment.
async function approveAssignment(formData: FormData) {
  "use server";
  noStore();

  const assignmentId = formData.get("assignmentId") as string;
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get the assignment details to know who to notify
  const { data: assignment } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisations (
        title,
        valid_for_days
      )
    `)
    .eq("id", assignmentId)
    .single();

  // Get the approver's name
  const { data: approverProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Update the authorisation assignment status to 'completed' and record approval details.
  const { error } = await supabase
    .from("authorisation_assignments")
    .update({ 
      assignment_status: "completed",
      approved_at: new Date().toISOString(),
      approved_by: user.id
    })
    .eq("id", assignmentId);

  if (error) {
    console.error("Error approving assignment:", error);
    redirect(`/app/admin/review/${assignmentId}?banner=approval_failed`);
  }

  // Send notification to the trainee about the approval
  if (assignment && assignment.user_id) {
    try {
      const { notifyUser } = await import("@/lib/notifications/dispatcher");
      const authorization = assignment.authorisations as any;
      
      await notifyUser(
        assignment.user_id,
        "authorization_approved",
        {
          authorizationTitle: authorization?.title || "Authorization",
          approvedBy: approverProfile?.full_name || user.email,
          validFor: authorization?.valid_for_days || null,
          url: "/app/myprofile/authorisations"
        }
      );
      console.log(`✅ Notification sent to trainee ${assignment.user_id} for authorization approval`);
    } catch (notifyError) {
      console.error("Failed to send notification:", notifyError);
      // Don't block the approval process if notification fails
    }
  }

  // Redirect back to the admin dashboard with a success banner
  redirect("/app/admin?tab=pending_authorisations&banner=approval_success");
}

export default async function ReviewAssignmentPage({ params }: Props) {
  // Check if user has Senior Management role
  const isSeniorManager = await hasRole("Senior Management");
  if (!isSeniorManager) {
    redirect("/app/admin?tab=pending_authorisations&banner=no_access");
  }

  const resolvedParams = await params;
  const { assignment, profile, courses } = await loadAssignmentDetails(resolvedParams.assignmentId);

  const authorisation = assignment.authorisations as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Authorisation</h1>
          <p className="text-sm text-gray-600">
            Review trainee's completed learning for authorisation approval
          </p>
        </div>
        <Link
          href="/app/admin?tab=pending_authorisations"
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Pending Authorisations
        </Link>
      </div>

      {/* Trainee Information */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Trainee Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="mt-1 text-sm text-gray-900">{profile.full_name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{profile.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <p className="mt-1 text-sm text-gray-900">{profile.department || "Not specified"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Description</label>
            <p className="mt-1 text-sm text-gray-900">{profile.job_description || "Not specified"}</p>
          </div>
        </div>
      </div>

      {/* Authorisation Details */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Authorisation Details</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">Authorisation</label>
          <p className="mt-1 text-lg font-semibold text-gray-900">{authorisation.title}</p>
          {authorisation.description && (
            <p className="mt-2 text-sm text-gray-600">{authorisation.description}</p>
          )}
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Completion Date</label>
          <p className="mt-1 text-sm text-gray-900">
            {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString() : "Not completed"}
          </p>
        </div>
      </div>

      {/* Course Progress */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Course Completion Summary</h2>
        <div className="space-y-4">
          {courses.map((course) => {
            const courseData = course.courses as any;
            const assignment = course.assignment;
            // Check if the course assignment status is 'completed' (meaning admin approved)
            const isCompleted = assignment?.assignment_status === "completed";
            // Check if the course assignment status is 'pending_approval' (meaning trainee completed but not yet approved)
            const isPendingApproval = assignment?.assignment_status === "pending_approval";

            return (
              <div key={course.course_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{courseData.title}</h3>
                  {courseData.description && (
                    <p className="text-sm text-gray-600 mt-1">{courseData.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {assignment?.completed_at ? 
                      `Completed ${new Date(assignment.completed_at).toLocaleDateString()}` :
                      "Not completed"
                    }
                  </div>
                  {/* Display status based on whether it's completed or pending approval */}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isCompleted 
                      ? "bg-green-100 text-green-800" 
                      : isPendingApproval
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                  }`}>
                    {isCompleted ? "✓ Completed" : isPendingApproval ? "Pending Approval" : "Not Completed"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Review Actions</h2>
        <form action={approveAssignment} className="flex gap-4">
          <input type="hidden" name="assignmentId" value={resolvedParams.assignmentId} />
          <button className="rounded-md bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700">
            Approve Authorisation
          </button>
          <button className="rounded-md bg-red-600 px-6 py-2 text-sm text-white hover:bg-red-700">
            Request Additional Training
          </button>
          <button className="rounded-md border px-6 py-2 text-sm hover:bg-gray-50">
            Add Notes
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Note: Review functionality will be implemented in the next phase
        </p>
      </div>
    </div>
  );
}