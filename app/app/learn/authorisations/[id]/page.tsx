// @ts-nocheck
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RouteParams = { id: string };

export default async function LearnAuthorisationPage(props: {
  params: Promise<RouteParams>;
}) {
  const { id: authorisationId } = await props.params;
  const supabase = await createSupabaseServer();

  // Require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/login");

  // Check if user has an assignment for this authorization
  const { data: assignment, error: assignmentErr } = await supabase
    .from("authorisation_assignments")
    .select("id, assignment_status")
    .eq("authorisation_id", authorisationId)
    .eq("user_id", user.id)
    .single();

  if (assignmentErr || !assignment) {
    console.error("No authorization assignment", assignmentErr);
    redirect("/app/learn?error=not_assigned");
  }

  // Load authorization details
  const { data: authorization, error: authErr } = await supabase
    .from("authorisations")
    .select("id, title, description, status")
    .eq("id", authorisationId)
    .single();
  if (authErr || !authorization) {
    console.error("Authorization load error", authErr);
    notFound();
  }

  // Load courses in this authorization
  const { data: authCourses, error: coursesErr } = await supabase
    .from("authorisation_courses")
    .select(`
      course_id,
      order_index,
      courses!inner(
        id,
        title,
        description,
        status
      )
    `)
    .eq("authorisation_id", authorisationId)
    .order("order_index", { ascending: true });

  if (coursesErr) {
    console.error("Courses load error", coursesErr);
    notFound();
  }

  // Get user's course assignments and progress for these courses
  const courseIds = (authCourses ?? []).map(ac => ac.course_id);

  const { data: courseAssignments } = courseIds.length > 0 ? await supabase
    .from("course_assignments")
    .select("id, course_id, assignment_status, completed_at")
    .eq("user_id", user.id)
    .eq("role", "trainee")
    .in("course_id", courseIds) : { data: [] };

  // Create a map of course assignments
  const assignmentMap = new Map(
    (courseAssignments ?? []).map(ca => [ca.course_id, ca])
  );

  // For each course, get module counts and progress
  const coursesWithProgress = await Promise.all(
    (authCourses ?? []).map(async (authCourse) => {
      const courseId = authCourse.course_id;
      const courseAssignment = assignmentMap.get(courseId);

      // Get all modules for this course
      const { data: allModules } = await supabase
        .from("course_modules")
        .select("id, type")
        .eq("course_id", courseId);

      const digitalModules = (allModules ?? []).filter(m => 
        m.type === "digital_training" || m.type === "digital_assessment_quiz"
      );
      const onsiteModules = (allModules ?? []).filter(m => 
        m.type === "onsite_training" || m.type === "onsite_assessment"
      );

      // Get progress if assignment exists
      let completedModules = [];
      if (courseAssignment) {
        const authAdminClient = supabaseAdmin();
        const { data: progress } = await authAdminClient
          .from("assignment_progress")
          .select("module_id")
          .eq("assignment_id", courseAssignment.id);
        completedModules = progress ?? [];
      }

      const completedModuleIds = new Set(completedModules.map(p => p.module_id));
      const digitalComplete = digitalModules.every(m => completedModuleIds.has(m.id));
      const onsiteComplete = onsiteModules.every(m => completedModuleIds.has(m.id));
      const allComplete = courseAssignment?.assignment_status === "completed";

      return {
        ...authCourse,
        assignment: courseAssignment,
        totalModules: allModules?.length ?? 0,
        completedModules: completedModules.length,
        digitalModules: digitalModules.length,
        onsiteModules: onsiteModules.length,
        digitalComplete,
        onsiteComplete,
        allComplete,
        // Add counts for onsite modules for the display logic
        onsite_training_count: onsiteModules.filter(m => m.type === "onsite_training").length,
        onsite_assessment_count: onsiteModules.filter(m => m.type === "onsite_assessment").length,
      };
    })
  );

  // Calculate overall progress
  const totalCourses = coursesWithProgress.length;
  const completedCourses = coursesWithProgress.filter(c => c.allComplete).length;
  const digitalReadyCourses = coursesWithProgress.filter(c => c.digitalComplete).length;
  const progressPercent = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

  // Determine next actions
  const nextDigitalCourse = coursesWithProgress.find(c => !c.digitalComplete && c.assignment);
  const pendingOnsiteCourses = coursesWithProgress.filter(c => c.digitalComplete && !c.allComplete);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <Link href="/app/myprofile" className="text-sm text-blue-600 hover:underline">
          ← Back to My Profile
        </Link>

        <div className="border-b pb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {authorization.title}
          </h1>
          {authorization.description && (
            <p className="text-gray-600 mb-4">{authorization.description}</p>
          )}

          {/* Overall Progress */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Authorization Progress</span>
              <span className="text-sm font-bold text-green-600">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {completedCourses} of {totalCourses} courses completed
            </div>
          </div>
        </div>
      </div>

      {/* Next Actions */}
      {assignment.assignment_status !== "completed" && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h2 className="font-semibold text-blue-800 mb-3">What's Next?</h2>

          {nextDigitalCourse ? (
            <div className="space-y-3">
              <p className="text-sm text-blue-700">
                Continue with digital training for <strong>{nextDigitalCourse.courses.title}</strong>
              </p>
              <Link
                href={`/app/learn/courses/${nextDigitalCourse.course_id}`}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Continue Digital Training →
              </Link>
            </div>
          ) : digitalReadyCourses === totalCourses && pendingOnsiteCourses.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-blue-700">
                <strong>Digital training complete!</strong> You're now ready for onsite training and assessments. 
                Your trainer will contact you to schedule these sessions.
              </p>
              <div className="text-xs text-gray-600">
                Courses ready for onsite: {pendingOnsiteCourses.map(c => c.courses.title).join(", ")}
              </div>
            </div>
          ) : (
            <p className="text-sm text-blue-700">
              Great progress! Keep working through the course modules.
            </p>
          )}
        </div>
      )}

      {/* Course List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Courses in this Authorization</h2>

        <div className="space-y-3">
          {coursesWithProgress.map((courseProgress, index) => {
            const course = courseProgress.courses;
            const isNextDigital = nextDigitalCourse?.course_id === course.id;

            // Calculate digital progress percentage
            const digitalProgress = courseProgress.digitalModules > 0 
              ? Math.round((courseProgress.completedModules / courseProgress.digitalModules) * 100)
              : 100; // Assume 100% if no digital modules

            return (
              <div 
                key={course.id} 
                className={`rounded-lg border p-4 transition-all ${
                  isNextDigital 
                    ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' 
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-500">
                        Course {index + 1}
                      </span>
                      {courseProgress.allComplete && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                          ✓ Complete
                        </span>
                      )}
                      {!courseProgress.allComplete && courseProgress.digitalComplete && (course.onsite_training_count > 0 || course.onsite_assessment_count > 0) && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Awaiting Onsite
                        </span>
                      )}
                      {isNextDigital && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                          👁️ Current
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-1">{course.title}</h3>
                    {course.description && (
                      <p className="text-sm text-gray-600 mb-3">{course.description}</p>
                    )}

                    {/* Progress Details */}
                    <div className="text-xs text-gray-500 space-y-1">
                      <div>
                        Progress: {courseProgress.completedModules} / {courseProgress.totalModules} modules
                      </div>
                      <div>
                        Digital: {courseProgress.digitalComplete ? '✓ Complete' : `${courseProgress.digitalModules} modules`}
                        {courseProgress.onsiteModules > 0 && (
                          <span className="ml-3">
                            Onsite: {courseProgress.onsiteComplete ? '✓ Complete' : `${courseProgress.onsiteModules} modules pending`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {courseProgress.assignment && (
                      <Link
                        href={`/app/learn/courses/${course.id}`}
                        className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                          isNextDigital
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : courseProgress.allComplete
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'bg-gray-600 text-white hover:bg-gray-700'
                        }`}
                      >
                        {courseProgress.allComplete ? 'Review' : isNextDigital ? 'Continue' : 'View'}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completion Message */}
      {assignment.assignment_status === "completed" && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-xl font-semibold text-green-800 mb-2">
            Authorization Complete!
          </h2>
          <p className="text-green-700">
            Congratulations! You have successfully completed all courses for "{authorization.title}".
          </p>
        </div>
      )}
    </div>
  );
}