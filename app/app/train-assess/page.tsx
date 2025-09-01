
// app/app/train-assess/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

type PendingItem = {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  traineeId: string;
  traineeName: string;
  type: "training" | "assessment";
};

export default async function TrainAssessPage() {
  const supabase = await createSupabaseServer();
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login");

  console.log("Current user:", user.id);

  // Get courses where user is assigned as onsite_trainer or onsite_assessor
  const { data: trainerAssignments } = await supabase
    .from("course_assignments")
    .select("course_id, role")
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"]);

  const trainerCourseIds = (trainerAssignments || []).map(a => a.course_id);
  console.log("Trainer course IDs:", trainerCourseIds);

  if (trainerCourseIds.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Training & Assessment</h1>
        <p className="text-gray-600">You are not assigned as a trainer or assessor for any courses.</p>
      </div>
    );
  }

  // Get all trainee assignments for these courses
  const { data: traineeAssignments } = await supabase
    .from("course_assignments")
    .select(`
      id,
      course_id,
      user_id,
      assignment_status,
      profiles!inner(full_name, first_name, last_name)
    `)
    .in("course_id", trainerCourseIds)
    .eq("role", "trainee")
    .in("assignment_status", ["assigned", "in_progress"]);

  console.log("Trainee assignments found:", traineeAssignments?.length || 0);

  // Get course details
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .in("id", trainerCourseIds);

  const courseMap = new Map(courses?.map(c => [c.id, c.title]) || []);

  const pendingTraining: PendingItem[] = [];
  const pendingAssessment: PendingItem[] = [];

  // Check each trainee assignment
  for (const assignment of traineeAssignments || []) {
    const courseId = assignment.course_id;
    const assignmentId = assignment.id;
    const traineeId = assignment.user_id;
    const courseTitle = courseMap.get(courseId) || "Unknown Course";
    
    const profile = assignment.profiles as any;
    const traineeName = profile?.full_name || 
      (profile?.first_name && profile?.last_name ? 
        `${profile.first_name} ${profile.last_name}` : "Unknown");

    // Get all modules for this course
    const { data: allModules } = await supabase
      .from("course_modules")
      .select("id, type")
      .eq("course_id", courseId);

    if (!allModules) continue;

    const digitalModules = allModules.filter(m => 
      m.type === "digital_training" || m.type === "digital_assessment_quiz"
    );
    const onsiteTrainingModules = allModules.filter(m => m.type === "onsite_training");
    const onsiteAssessmentModules = allModules.filter(m => m.type === "onsite_assessment");

    // Get assignment progress
    const { data: progress } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignmentId);

    const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

    // Check if digital modules are complete and onsite training is pending
    const allDigitalComplete = digitalModules.length > 0 && 
      digitalModules.every(m => completedModuleIds.has(m.id));
    const onsiteTrainingComplete = onsiteTrainingModules.every(m => completedModuleIds.has(m.id));

    // Check if user is assigned as trainer for this course
    const isTrainer = trainerAssignments?.some(a => 
      a.course_id === courseId && a.role === "onsite_trainer"
    );

    // Check if user is assigned as assessor for this course
    const isAssessor = trainerAssignments?.some(a => 
      a.course_id === courseId && a.role === "onsite_assessor"
    );

    // Add to pending training if digital is complete but onsite training is not
    if (isTrainer && allDigitalComplete && !onsiteTrainingComplete && onsiteTrainingModules.length > 0) {
      pendingTraining.push({
        assignmentId,
        courseId,
        courseTitle,
        traineeId,
        traineeName,
        type: "training"
      });
    }

    // Add to pending assessment if onsite training is complete but assessment is not
    if (isAssessor && onsiteTrainingComplete && onsiteAssessmentModules.length > 0) {
      const onsiteAssessmentComplete = onsiteAssessmentModules.every(m => completedModuleIds.has(m.id));
      if (!onsiteAssessmentComplete) {
        pendingAssessment.push({
          assignmentId,
          courseId,
          courseTitle,
          traineeId,
          traineeName,
          type: "assessment"
        });
      }
    }
  }

  console.log("Final pending training items:", pendingTraining.length);
  console.log("Final pending assessment items:", pendingAssessment.length);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Training & Assessment</h1>
        <p className="text-gray-600 mt-1">
          Manage onsite training and assessments for your assigned courses.
        </p>
      </div>

      {/* Pending Training */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pending Onsite Training</h2>
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
            {pendingTraining.length}
          </span>
        </div>

        {pendingTraining.length === 0 ? (
          <div className="rounded-lg border bg-gray-50 p-4 text-center text-gray-600">
            No pending onsite training sessions.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTraining.map((item) => (
              <div key={`${item.assignmentId}-training`} className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{item.courseTitle}</h3>
                    <p className="text-sm text-gray-600">Trainee: {item.traineeName}</p>
                    <p className="text-xs text-gray-500">
                      Digital modules completed - ready for onsite training
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/learn/courses/${item.courseId}?assignment=${item.assignmentId}&mode=trainer`}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                    >
                      Conduct Training
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Assessment */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pending Onsite Assessment</h2>
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
            {pendingAssessment.length}
          </span>
        </div>

        {pendingAssessment.length === 0 ? (
          <div className="rounded-lg border bg-gray-50 p-4 text-center text-gray-600">
            No pending onsite assessments.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingAssessment.map((item) => (
              <div key={`${item.assignmentId}-assessment`} className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{item.courseTitle}</h3>
                    <p className="text-sm text-gray-600">Trainee: {item.traineeName}</p>
                    <p className="text-xs text-gray-500">
                      Onsite training completed - ready for assessment
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/learn/courses/${item.courseId}?assignment=${item.assignmentId}&mode=assessor`}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                    >
                      Conduct Assessment
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Help Text */}
      <div className="rounded-lg border bg-blue-50 p-4">
        <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Trainees appear in "Pending Training" after completing all digital modules</li>
          <li>• After onsite training is completed, they move to "Pending Assessment"</li>
          <li>• Complete the assessment to finish their course journey</li>
        </ul>
      </div>
    </div>
  );
}
