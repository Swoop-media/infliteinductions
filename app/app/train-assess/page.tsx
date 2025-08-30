// app/app/train-assess/page.tsx
import { enforceAnyRoleOrHome } from "@/lib/roles/enforce";
import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PendingTraining = {
  enrolment_id: string;
  course_id: string;
  course_title: string;
  learner_name: string;
  learner_email: string;
  user_id: string;
  created_at: string;
};

type PendingAssessment = {
  enrolment_id: string;
  course_id: string;
  course_title: string;
  learner_name: string;
  learner_email: string;
  user_id: string;
  created_at: string;
};

export default async function TrainAssessPage() {
  // Enforce role-based access - only allow specific roles
  await enforceAnyRoleOrHome([
    "Trainers and Assessors", 
    "Senior Management", 
    "Admin"
  ]);

  const supabase = await createSupabaseServer();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // First get courses where current user is onsite_trainer
  const { data: trainerCourses = [] } = await supabase
    .from("course_assignments")
    .select("course_id")
    .eq("user_id", user.id)
    .eq("role", "onsite_trainer");

  const trainerCourseIds = trainerCourses.map(c => c.course_id);

  console.log('Current user:', user.id);
  console.log('Trainer course IDs:', trainerCourseIds);

  // Fetch pending onsite training (where user is assigned as onsite_trainer)
  // First try course_enrolments
  const { data: pendingTraining = [] } = trainerCourseIds.length > 0 
    ? await supabase
        .from("course_enrolments")
        .select(`
          id,
          course_id,
          user_id,
          created_at,
          status,
          courses!inner(id, title),
          profiles(id, name, email)
        `)
        .eq("status", "approved")
        .in("course_id", trainerCourseIds)
    : { data: [] };

  console.log('Pending training from course_enrolments:', pendingTraining);

  // Also fetch from course_assignments (trainee assignments)
  const { data: pendingTrainingAssignments = [] } = trainerCourseIds.length > 0 
    ? await supabase
        .from("course_assignments")
        .select(`
          id,
          course_id,
          user_id,
          created_at,
          courses!inner(id, title),
          profiles!inner(id, name, email)
        `)
        .eq("role", "trainee")
        .in("course_id", trainerCourseIds)
    : { data: [] };

  console.log('Pending training from course_assignments:', pendingTrainingAssignments);

  // Filter for enrolments that have completed digital phases but not onsite training
  const pendingTrainingItems: PendingTraining[] = [];

  // Process course_enrolments
  for (const enrolment of pendingTraining) {
    console.log('Processing enrolment:', enrolment.id, 'for course:', enrolment.course_id);

    // Check if this learner has completed all digital modules for this course
    const { data: digitalModules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", enrolment.course_id)
      .in("type", ["digital_training", "digital_assessment_quiz"]);

    console.log('Digital modules for course:', digitalModules?.length || 0);

    if (digitalModules && digitalModules.length > 0) {
      // Check completed digital modules
      const { data: completedDigital } = await supabase
        .from("module_progress")
        .select("module_id")
        .eq("enrolment_id", enrolment.id)
        .in("module_id", digitalModules.map(m => m.id));

      console.log('Completed digital modules:', completedDigital?.length || 0, 'of', digitalModules.length);

      // Only check if all digital modules are complete
      if (completedDigital && completedDigital.length >= digitalModules.length) {
        // Check if onsite training is already completed
        const { data: onsiteModule } = await supabase
          .from("course_modules")
          .select("id")
          .eq("course_id", enrolment.course_id)
          .eq("type", "onsite_training")
          .single();

        if (onsiteModule) {
          const { data: onsiteProgress } = await supabase
            .from("module_progress")
            .select("id")
            .eq("enrolment_id", enrolment.id)
            .eq("module_id", onsiteModule.id)
            .maybeSingle();

          if (!onsiteProgress) {
            console.log('Adding to pending training (digital complete):', enrolment.id);
            const profileData = (enrolment as any).profiles;
            pendingTrainingItems.push({
              enrolment_id: enrolment.id,
              course_id: enrolment.course_id,
              course_title: (enrolment as any).courses.title,
              learner_name: profileData?.name || profileData?.email || 'Unknown',
              learner_email: profileData?.email || 'No email',
              user_id: enrolment.user_id,
              created_at: enrolment.created_at
            });
          }
        }
      }
    } else {
      // No digital modules, so check onsite training directly
      const { data: onsiteModule } = await supabase
        .from("course_modules")
        .select("id")
        .eq("course_id", enrolment.course_id)
        .eq("type", "onsite_training")
        .single();

      if (onsiteModule) {
        const { data: onsiteProgress } = await supabase
          .from("module_progress")
          .select("id")
          .eq("enrolment_id", enrolment.id)
          .eq("module_id", onsiteModule.id)
          .maybeSingle();

        if (!onsiteProgress) {
          console.log('Adding to pending training (no digital modules):', enrolment.id);
          const profileData = (enrolment as any).profiles;
          pendingTrainingItems.push({
            enrolment_id: enrolment.id,
            course_id: enrolment.course_id,
            course_title: (enrolment as any).courses.title,
            learner_name: profileData?.name || profileData?.email || 'Unknown',
            learner_email: profileData?.email || 'No email',
            user_id: enrolment.user_id,
            created_at: enrolment.created_at
          });
        }
      }
    }
  }

  // Process course_assignments (trainee assignments)
  for (const assignment of pendingTrainingAssignments) {
    console.log('Processing assignment:', assignment.id, 'for course:', assignment.course_id);

    // Check if this learner has completed all digital modules for this course
    const { data: digitalModules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignment.course_id)
      .in("type", ["digital_training", "digital_assessment_quiz"]);

    console.log('Digital modules for assignment course:', digitalModules?.length || 0);

    if (digitalModules && digitalModules.length > 0) {
      // Check completed digital modules via assignment_progress
      const { data: completedDigital } = await supabase
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignment.id)
        .in("module_id", digitalModules.map(m => m.id));

      console.log('Completed digital modules (assignment):', completedDigital?.length || 0, 'of', digitalModules.length);

      // Only check if all digital modules are complete
      if (completedDigital && completedDigital.length >= digitalModules.length) {
        // Check if onsite training is already completed
        const { data: onsiteModule } = await supabase
          .from("course_modules")
          .select("id")
          .eq("course_id", assignment.course_id)
          .eq("type", "onsite_training")
          .single();

        if (onsiteModule) {
          const { data: onsiteProgress } = await supabase
            .from("assignment_progress")
            .select("id")
            .eq("assignment_id", assignment.id)
            .eq("module_id", onsiteModule.id)
            .maybeSingle();

          if (!onsiteProgress) {
            console.log('Adding to pending training (assignment digital complete):', assignment.id);
            const profileData = (assignment as any).profiles;
            pendingTrainingItems.push({
              enrolment_id: assignment.id,
              course_id: assignment.course_id,
              course_title: (assignment as any).courses.title,
              learner_name: profileData?.name || profileData?.email || 'Unknown',
              learner_email: profileData?.email || 'No email',
              user_id: assignment.user_id,
              created_at: assignment.created_at
            });
          }
        }
      }
    } else {
      // No digital modules, so check onsite training directly
      const { data: onsiteModule } = await supabase
        .from("course_modules")
        .select("id")
        .eq("course_id", assignment.course_id)
        .eq("type", "onsite_training")
        .single();

      if (onsiteModule) {
        const { data: onsiteProgress } = await supabase
          .from("assignment_progress")
          .select("id")
          .eq("assignment_id", assignment.id)
          .eq("module_id", onsiteModule.id)
          .maybeSingle();

        if (!onsiteProgress) {
          console.log('Adding to pending training (assignment no digital modules):', assignment.id);
          const profileData = (assignment as any).profiles;
          pendingTrainingItems.push({
            enrolment_id: assignment.id,
            course_id: assignment.course_id,
            course_title: (assignment as any).courses.title,
            learner_name: profileData?.name || profileData?.email || 'Unknown',
            learner_email: profileData?.email || 'No email',
            user_id: assignment.user_id,
            created_at: assignment.created_at
          });
        }
      }
    }
  }

  // First get courses where current user is onsite_assessor
  const { data: assessorCourses = [] } = await supabase
    .from("course_assignments")
    .select("course_id")
    .eq("user_id", user.id)
    .eq("role", "onsite_assessor");

  const assessorCourseIds = assessorCourses.map(c => c.course_id);

  // Fetch pending assessments (where user is assigned as onsite_assessor)
  // First try course_enrolments
  const { data: pendingAssessments = [] } = assessorCourseIds.length > 0
    ? await supabase
        .from("course_enrolments")
        .select(`
          id,
          course_id,
          user_id,
          created_at,
          courses!inner(id, title),
          profiles!inner(id, name, email)
        `)
        .eq("status", "approved")
        .in("course_id", assessorCourseIds)
    : { data: [] };

  // Also fetch from course_assignments (trainee assignments)
  const { data: pendingAssessmentAssignments = [] } = assessorCourseIds.length > 0 
    ? await supabase
        .from("course_assignments")
        .select(`
          id,
          course_id,
          user_id,
          created_at,
          courses!inner(id, title),
          profiles!inner(id, name, email)
        `)
        .eq("role", "trainee")
        .in("course_id", assessorCourseIds)
    : { data: [] };

  // Filter for enrolments that have completed onsite training but not assessment
  const pendingAssessmentItems: PendingAssessment[] = [];

  // Process regular enrolments
  for (const enrolment of pendingAssessments || []) {
    // Check if course has onsite_assessment module
    const { data: onsiteAssessmentModule } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", enrolment.course_id)
      .eq("type", "onsite_assessment")
      .maybeSingle();

    if (!onsiteAssessmentModule) continue;

    // Check if all previous modules are completed (digital + onsite training)
    const { data: allPreviousModules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", enrolment.course_id)
      .in("type", ["digital_training", "digital_assessment_quiz", "onsite_training"]);

    if (allPreviousModules && allPreviousModules.length > 0) {
      const { data: completedPrevious } = await supabase
        .from("module_progress")
        .select("module_id")
        .eq("enrolment_id", enrolment.id)
        .in("module_id", allPreviousModules.map(m => m.id));

      // Only include if all previous modules are completed
      if (completedPrevious?.length === allPreviousModules.length) {
        // Check if assessment is NOT yet completed
        const { data: assessmentProgress } = await supabase
          .from("module_progress")
          .select("id")
          .eq("enrolment_id", enrolment.id)
          .eq("module_id", onsiteAssessmentModule.id)
          .maybeSingle();

        if (!assessmentProgress) {
          pendingAssessmentItems.push({
            enrolment_id: enrolment.id,
            course_id: enrolment.course_id,
            course_title: (enrolment as any).courses.title,
            learner_name: (enrolment as any).profiles.name,
            learner_email: (enrolment as any).profiles.email,
            user_id: enrolment.user_id,
            created_at: enrolment.created_at
          });
        }
      }
    }
  }

  // Process course assignments for assessments
  for (const assignment of pendingAssessmentAssignments || []) {
    // Check if course has onsite_assessment module
    const { data: onsiteAssessmentModule } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignment.course_id)
      .eq("type", "onsite_assessment")
      .maybeSingle();

    if (!onsiteAssessmentModule) continue;

    // Check if all previous modules are completed (digital + onsite training)
    const { data: allPreviousModules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignment.course_id)
      .in("type", ["digital_training", "digital_assessment_quiz", "onsite_training"]);

    if (allPreviousModules && allPreviousModules.length > 0) {
      const { data: completedPrevious } = await supabase
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignment.id)
        .in("module_id", allPreviousModules.map(m => m.id));

      // Only include if all previous modules are completed
      if (completedPrevious?.length === allPreviousModules.length) {
        // Check if assessment is NOT yet completed
        const { data: assessmentProgress } = await supabase
          .from("assignment_progress")
          .select("id")
          .eq("assignment_id", assignment.id)
          .eq("module_id", onsiteAssessmentModule.id)
          .maybeSingle();

        if (!assessmentProgress) {
          pendingAssessmentItems.push({
            enrolment_id: assignment.id, // Use assignment ID as enrolment_id
            course_id: assignment.course_id,
            course_title: (assignment as any).courses.title,
            learner_name: (assignment as any).profiles.name || (assignment as any).profiles.email,
            learner_email: (assignment as any).profiles.email,
            user_id: assignment.user_id,
            created_at: assignment.created_at
          });
        }
      }
    }
  }

  console.log('Final pending training items:', pendingTrainingItems);
  console.log('Final pending assessment items:', pendingAssessmentItems);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Train/Assess</h1>
        <p className="text-sm text-muted-foreground">
          Manage training delivery and assessments for learners.
        </p>
      </div>

      {/* Section 1: Pending Onsite Training */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Pending Onsite Training</h2>
          <span className="text-sm text-muted-foreground">{pendingTrainingItems.length} pending</span>
        </div>
        {pendingTrainingItems.length === 0 ? (
          <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
            No pending onsite training sessions at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTrainingItems.map((item) => (
              <div key={item.enrolment_id} className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{item.course_title}</h3>
                  <p className="text-sm text-gray-600">
                    Learner: {item.learner_name} ({item.learner_email})
                  </p>
                  <p className="text-xs text-gray-500">
                    Enrolled: {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/app/assess/${item.enrolment_id}?module=onsite_training`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Begin Training
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Pending Assessments */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Pending Assessments</h2>
          <span className="text-sm text-muted-foreground">{pendingAssessmentItems.length} pending</span>
        </div>
        {pendingAssessmentItems.length === 0 ? (
          <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
            No pending assessments at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingAssessmentItems.map((item) => (
              <div key={item.enrolment_id} className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{item.course_title}</h3>
                  <p className="text-sm text-gray-600">
                    Learner: {item.learner_name} ({item.learner_email})
                  </p>
                  <p className="text-xs text-gray-500">
                    Enrolled: {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/app/assess/${item.enrolment_id}?module=onsite_assessment`}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Begin Assessment
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Document Upload */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Document Upload</h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload training materials, assessment forms, and other documents.
          </p>
          <div className="bg-gray-50 rounded-md p-4 text-center text-sm text-gray-600">
            Document upload functionality will be implemented here.
          </div>
        </div>
      </div>
    </div>
  );
}