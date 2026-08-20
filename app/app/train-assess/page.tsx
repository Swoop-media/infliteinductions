// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TrainAssessClient, { PendingItem } from "./TrainAssessClient";
import { getPinnedCourseContext } from "@/lib/course-version";

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

  let pendingTrainingItems: PendingItem[] = [];
  let pendingAssessmentItems: PendingItem[] = [];
  let uniqueDepartments: Set<string> = new Set();

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
        assignment_status,
        course_version_id
      `)
      .eq("role", "trainee")
      .in("course_id", allCourseIds);

    if (!traineeAssignments || traineeAssignments.length === 0) {
      return (
        <TrainAssessClient 
          initialTrainingItems={pendingTrainingItems}
          initialAssessmentItems={pendingAssessmentItems}
          departments={[]}
        />
      );
    }

    // 2. Module definitions come from each trainee assignment's pinned course
    // version snapshot (not live course_modules). Resolved per-assignment below.

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
      .select("id, full_name, email, department, archived_at")
      .in("id", traineeUserIds);

    // Create lookup map for profiles
    const profilesMap = new Map<string, any>();
    allProfiles?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    // 5. Course title/department definitions come from each trainee assignment's
    // pinned course version snapshot (resolved per-assignment below). Pinned
    // contexts are cached by version id to avoid refetching the same snapshot.
    const pinnedContextCache = new Map<string, any>();

    async function resolvePinnedContext(assignment: any) {
      const cacheKey = assignment.course_version_id || `assignment:${assignment.id}`;
      if (pinnedContextCache.has(cacheKey)) return pinnedContextCache.get(cacheKey);
      let context: any = null;
      try {
        context = await getPinnedCourseContext(supabaseService, { assignmentId: assignment.id });
      } catch (error) {
        // Fail closed: an assignment without a valid pinned snapshot is skipped
        // rather than falling back to the live course definition.
        console.error(
          `Skipping trainee assignment ${assignment.id}: pinned course version unavailable`,
          error
        );
        context = null;
      }
      pinnedContextCache.set(cacheKey, context);
      return context;
    }

    // Now process each assignment using the pinned snapshot for content definitions
    // and live progress rows as evidence.
    
    for (const assignment of traineeAssignments) {
      const courseId = assignment.course_id;
      const traineeId = assignment.user_id;
      const assignmentId = assignment.id;
      
      // Skip assignments for archived trainees - they should not appear in any
      // pending list (training or assessment). Restoring the user re-includes them.
      const traineeProfile = profilesMap.get(traineeId);
      if (traineeProfile?.archived_at) {
        continue;
      }

      // Skip assignments that are already marked as completed at the assignment level
      // These are fully done and shouldn't appear in pending lists
      if (assignment.assignment_status === 'completed') {
        continue;
      }

      // Module/title definitions come from this assignment's pinned snapshot.
      // Fail closed: skip the assignment if the pinned version is unavailable.
      const pinnedContext = await resolvePinnedContext(assignment);
      if (!pinnedContext) {
        continue;
      }

      const courseModules = pinnedContext.modules || [];
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

      // Course title/department come from the pinned snapshot definition.
      const pinnedCourse = pinnedContext.course || {};

      const traineeName = traineeProfile?.full_name || traineeProfile?.email || "Unknown";
      const traineeEmail = traineeProfile?.email || "";
      const courseTitle = pinnedContext.version?.title || pinnedCourse.title || "Unknown Course";
      const courseDepartment = pinnedCourse.department || "";
      const traineeDepartment = traineeProfile?.department || "";
      
      // Use trainee's department if available, otherwise use course department
      const itemDepartment = traineeDepartment || courseDepartment || "";

      // Collect departments for the filter UI from pinned + trainee data.
      if (courseDepartment && courseDepartment.trim() !== "") {
        uniqueDepartments.add(courseDepartment);
      }

      // Add to pending training if digital complete but onsite training not done
      if (allDigitalComplete && onsiteTrainingModules.length > 0 && !onsiteTrainingComplete && trainerCourseIds.has(courseId)) {
        const trainingItem: PendingItem = {
          id: assignmentId,
          trainee_name: traineeName,
          trainee_email: traineeEmail,
          course_title: courseTitle,
          course_id: courseId,
          assignment_id: assignmentId,
          created_at: assignment.created_at,
          type: 'training' as const,
          department: itemDepartment
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
            type: 'assessment' as const,
            department: itemDepartment
          });
        }
      }
    }
  }

  // Convert Set to sorted array for departments
  const departmentList = Array.from(uniqueDepartments).sort();

  return (
    <TrainAssessClient 
      initialTrainingItems={pendingTrainingItems}
      initialAssessmentItems={pendingAssessmentItems}
      departments={departmentList}
    />
  );
}