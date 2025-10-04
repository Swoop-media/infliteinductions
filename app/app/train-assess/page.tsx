// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TrainAssessClient, { PendingItem } from "./TrainAssessClient";

export default async function TrainAssessPage() {
  const supabase = await createSupabaseServer();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/auth/login");
  }

  // Get user's role assignments for training and assessment
  // Use admin client to bypass RLS since trainers need to see their trainer/assessor roles
  const supabaseServiceForTrainer = supabaseAdmin();
  
  const { data: trainerAssignments, error: trainerError } = await supabaseServiceForTrainer
    .from("course_assignments")
    .select("course_id, role")
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"]);

  // Build separate Sets for courses where user is trainer vs assessor
  const trainerCourseIds = new Set(
    trainerAssignments?.filter(a => a.role === "onsite_trainer").map(a => a.course_id) || []
  );
  const assessorCourseIds = new Set(
    trainerAssignments?.filter(a => a.role === "onsite_assessor").map(a => a.course_id) || []
  );
  const allCourseIds = [...new Set([...trainerCourseIds, ...assessorCourseIds])];

  let pendingTrainingItems: PendingTrainingItem[] = [];
  let pendingAssessmentItems: PendingTrainingItem[] = [];

  if (allCourseIds.length > 0) {
    // Use service role client to bypass RLS
    const supabaseService = supabaseAdmin();

    // OPTIMIZATION: Fetch data in batches instead of in loops
    
    // 1. Get all trainee assignments for relevant courses
    const { data: traineeAssignments, error: traineeError } = await supabaseService
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        created_at,
        assignment_status
      `)
      .eq("role", "trainee")
      .in("course_id", allCourseIds);

    if (!traineeAssignments || traineeAssignments.length === 0) {
      return renderPage(pendingTrainingItems, pendingAssessmentItems);
    }

    // 2. Get ALL modules for ALL relevant courses in ONE query
    const { data: allCourseModules } = await supabaseService
      .from("course_modules")
      .select("id, course_id, type, title, order_index")
      .in("course_id", allCourseIds)
      .order("course_id", { ascending: true })
      .order("order_index", { ascending: true });

    // Group modules by course for easy lookup
    const modulesByCourse = new Map<string, any[]>();
    allCourseModules?.forEach(module => {
      const courseModules = modulesByCourse.get(module.course_id) || [];
      courseModules.push(module);
      modulesByCourse.set(module.course_id, courseModules);
    });

    // 3. Get ALL progress for ALL assignments - BATCH to avoid timeout
    const assignmentIds = traineeAssignments.map(a => a.id);
    const batchSize = 100; // Query 100 assignments at a time (increased from 50 for better performance)
    const allProgress = [];
    
    for (let i = 0; i < assignmentIds.length; i += batchSize) {
      const batch = assignmentIds.slice(i, i + batchSize);
      const { data: batchProgress, error: progressError } = await supabaseService
        .from("assignment_progress")
        .select("assignment_id, module_id")
        .in("assignment_id", batch);
      
      if (batchProgress) {
        allProgress.push(...batchProgress);
      }
    }

    // Group progress by assignment for easy lookup
    const progressByAssignment = new Map<string, Set<string>>();
    allProgress?.forEach(progress => {
      const moduleSet = progressByAssignment.get(progress.assignment_id) || new Set();
      moduleSet.add(progress.module_id);
      progressByAssignment.set(progress.assignment_id, moduleSet);
    });

    // 4. Get ALL profiles for ALL trainees in ONE query
    const traineeUserIds = [...new Set(traineeAssignments.map(a => a.user_id))];
    const { data: allProfiles } = await supabaseService
      .from("profiles")
      .select("id, full_name, email")
      .in("id", traineeUserIds);

    // Create lookup map for profiles
    const profilesMap = new Map<string, any>();
    allProfiles?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    // 5. Get ALL courses info in ONE query
    const { data: allCourses } = await supabaseService
      .from("courses")
      .select("id, title")
      .in("id", allCourseIds);

    // Create lookup map for courses
    const coursesMap = new Map<string, any>();
    allCourses?.forEach(course => {
      coursesMap.set(course.id, course);
    });

    // Now process each assignment using the pre-fetched data (no additional queries!)
    
    for (const assignment of traineeAssignments) {
      const courseId = assignment.course_id;
      const traineeId = assignment.user_id;
      const assignmentId = assignment.id;
      
      // Skip assignments that are already marked as completed at the assignment level
      // These are fully done and shouldn't appear in pending lists
      if (assignment.assignment_status === 'completed') {
        continue;
      }
      
      // Use pre-fetched data instead of making queries
      const courseModules = modulesByCourse.get(courseId) || [];
      if (courseModules.length === 0) {
        continue;
      }

      const digitalModules = courseModules.filter(m =>
        m.type === "digital_training" || m.type === "digital_assessment_quiz"
      );
      const onsiteTrainingModules = courseModules.filter(m => m.type === "onsite_training");
      const onsiteAssessmentModules = courseModules.filter(m => m.type === "onsite_assessment");

      // Use pre-fetched progress
      const completedModuleIds = progressByAssignment.get(assignmentId) || new Set();

      // Check if all digital modules are complete (or if there are no digital modules)
      const allDigitalComplete = digitalModules.length === 0 || 
        digitalModules.every(m => completedModuleIds.has(m.id));

      // Check if onsite training is complete
      const onsiteTrainingComplete = onsiteTrainingModules.length > 0 && 
        onsiteTrainingModules.every(m => completedModuleIds.has(m.id));
      
      // Check if training stage is done or not required (for courses with only assessment)
      const trainingStageComplete = onsiteTrainingModules.length === 0 
        ? allDigitalComplete 
        : onsiteTrainingComplete;

      // Use pre-fetched profile and course data from maps
      const traineeProfile = profilesMap.get(traineeId);
      const courseInfo = coursesMap.get(courseId);
      
      const traineeName = traineeProfile?.full_name || traineeProfile?.email || "Unknown";
      const traineeEmail = traineeProfile?.email || "";
      const courseTitle = courseInfo?.title || "Unknown Course";

      // Add to pending training if digital complete but onsite training not done
      if (allDigitalComplete && onsiteTrainingModules.length > 0 && !onsiteTrainingComplete && trainerCourseIds.has(courseId)) {
        const trainingItem = {
          id: assignmentId,
          trainee_name: traineeName,
          trainee_email: traineeEmail,
          course_title: courseTitle,
          course_id: courseId,
          assignment_id: assignmentId,
          created_at: assignment.created_at,
          type: 'training' as const
        };
        pendingTrainingItems.push(trainingItem);
      }

      // Add to pending assessment if training stage is complete but assessment not done
      if (trainingStageComplete && onsiteAssessmentModules.length > 0 && assessorCourseIds.has(courseId)) {
        const onsiteAssessmentComplete = onsiteAssessmentModules.every(m => completedModuleIds.has(m.id));
        if (!onsiteAssessmentComplete) {
          pendingAssessmentItems.push({
            id: assignmentId,
            trainee_name: traineeName,
            trainee_email: traineeEmail,
            course_title: courseTitle,
            course_id: courseId,
            assignment_id: assignmentId,
            created_at: assignment.created_at,
            type: 'assessment' as const
          });
        }
      }
    }
  }

  return (
    <TrainAssessClient 
      initialTrainingItems={pendingTrainingItems}
      initialAssessmentItems={pendingAssessmentItems}
    />
  );
}