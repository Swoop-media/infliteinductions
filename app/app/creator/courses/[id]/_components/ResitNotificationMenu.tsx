// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type CompletedTrainee = {
  user_id: string;
  assignment_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
};

async function getCompletedTrainees(courseId: string): Promise<CompletedTrainee[]> {
  const supabase = await createSupabaseServer();
  
  // Get all completed assignments for this course
  const { data: completedAssignments, error } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      completed_at,
      profiles!inner(
        full_name,
        email
      )
    `)
    .eq("course_id", courseId)
    .eq("role", "trainee")
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null);

  if (error) {
    console.error("Error fetching completed trainees:", error);
    return [];
  }

  return (completedAssignments || []).map(assignment => ({
    user_id: assignment.user_id,
    assignment_id: assignment.id,
    completed_at: assignment.completed_at,
    full_name: assignment.profiles?.full_name || null,
    email: assignment.profiles?.email || null,
  }));
}

// Server Action to send resit notifications
async function sendResitNotifications(formData: FormData) {
  "use server";
  
  const courseId = formData.get("courseId") as string;
  const selectedTrainees = formData.getAll("selectedTrainees") as string[];
  
  if (!courseId || selectedTrainees.length === 0) {
    redirect(`/app/creator/courses/${courseId}?tab=details&error=no_trainees_selected`);
  }

  const supabase = await createSupabaseServer();
  
  // Get course details
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("id", courseId)
    .single();

  const courseTitle = course?.title || "Course";

  // Get current user for notification context
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const senderName = senderProfile?.full_name || "Course Creator";

  // Send notifications to each selected trainee
  try {
    const { createNotification } = await import("@/app/app/_actions/notifications");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    for (const traineeId of selectedTrainees) {
      await createNotification({
        recipientUserId: traineeId,
        type: "course_updated",
        title: `Course Updated - Resit Required: ${courseTitle}`,
        body: `The course "${courseTitle}" has been updated and you need to complete it again. Please log in to start your resit.`,
        sendTeams: true,
        data: {
          courseTitle,
          courseId,
          senderName,
          senderId: user.id,
          url: `${siteUrl}/app/learn/courses/${courseId}`,
          event_id: `course_resit_${courseId}_${traineeId}_${Date.now()}`
        }
      });
    }

    redirect(`/app/creator/courses/${courseId}?tab=details&notice=resit_notifications_sent&count=${selectedTrainees.length}`);
  } catch (error) {
    console.error("Error sending resit notifications:", error);
    redirect(`/app/creator/courses/${courseId}?tab=details&error=notification_failed`);
  }
}

export default async function ResitNotificationMenu({ 
  courseId, 
  courseStatus 
}: { 
  courseId: string; 
  courseStatus: string;
}) {
  // Only show for published courses
  if (courseStatus !== "published") {
    return null;
  }

  const completedTrainees = await getCompletedTrainees(courseId);

  // Don't show if no one has completed the course
  if (completedTrainees.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-blue-600">📢</span>
        <h3 className="text-sm font-medium text-blue-900">
          Course Change Notifications
        </h3>
      </div>
      
      <p className="text-sm text-blue-700">
        This course has been published and {completedTrainees.length} trainee{completedTrainees.length !== 1 ? 's have' : ' has'} completed it. 
        You can notify them that the course has changed and they need to resit it.
      </p>

      <form action={sendResitNotifications} className="space-y-3">
        <input type="hidden" name="courseId" value={courseId} />
        
        <div className="space-y-2">
          <div className="text-xs font-medium text-blue-900">Select trainees to notify:</div>
          <div className="max-h-40 overflow-y-auto space-y-1 bg-white rounded border p-2">
            {completedTrainees.map((trainee) => (
              <label key={trainee.user_id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="selectedTrainees"
                  value={trainee.user_id}
                  className="rounded"
                />
                <div className="flex-1">
                  <span className="font-medium">{trainee.full_name || "Unknown Name"}</span>
                  <span className="text-gray-500 ml-2">{trainee.email}</span>
                  <div className="text-xs text-gray-400">
                    Completed: {new Date(trainee.completed_at).toLocaleDateString()}
                  </div>
                </div>
              </label>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-blue-700">
              <input
                type="checkbox"
                onChange={(e) => {
                  const checkboxes = document.querySelectorAll('input[name="selectedTrainees"]');
                  checkboxes.forEach((cb) => {
                    (cb as HTMLInputElement).checked = e.target.checked;
                  });
                }}
              />
              Select all
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Send Resit Notifications
        </button>
      </form>
      
      <div className="text-xs text-blue-600">
        💡 This will send both in-app notifications and Teams messages to selected trainees.
      </div>
    </div>
  );
}