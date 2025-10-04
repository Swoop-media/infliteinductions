// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, BookOpen, ClipboardCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatDateConsistent } from "@/lib/utils";

interface PendingTrainingItem {
  id: string;
  trainee_name: string;
  trainee_email: string;
  course_title: string;
  course_id: string;
  assignment_id: string;
  created_at: string;
  type: 'training' | 'assessment';
}

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
  
  // TEMPORARY: Log to see if query is timing out
  console.log('[Train-Assess] Starting trainer assignments query for user:', user.id);
  
  const { data: trainerAssignments, error: trainerError } = await supabaseServiceForTrainer
    .from("course_assignments")
    .select("course_id, role")
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"]);
  
  console.log('[Train-Assess] Trainer assignments result:', {
    success: !trainerError,
    count: trainerAssignments?.length || 0,
    error: trainerError?.message
  });

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
    
    console.log('[Train-Assess] Fetching trainee assignments for courses:', allCourseIds.length);
    
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

    console.log('[Train-Assess] Trainee assignments result:', {
      success: !traineeError,
      count: traineeAssignments?.length || 0,
      error: traineeError?.message
    });

    if (!traineeAssignments || traineeAssignments.length === 0) {
      console.log('[Train-Assess] No trainee assignments found, returning empty');
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

    // 3. Get ALL progress for ALL assignments in ONE query
    const assignmentIds = traineeAssignments.map(a => a.id);
    const { data: allProgress } = await supabaseService
      .from("assignment_progress")
      .select("assignment_id, module_id")
      .in("assignment_id", assignmentIds);

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
    console.log('[Train-Assess] Processing', traineeAssignments.length, 'assignments');
    let skippedCompleted = 0;
    let skippedNoModules = 0;
    let processedCount = 0;
    let notTrainerForCourse = 0;
    let notAssessorForCourse = 0;
    let digitalNotComplete = 0;
    let noOnsiteModules = 0;
    let allModulesComplete = 0;
    
    for (const assignment of traineeAssignments) {
      const courseId = assignment.course_id;
      const traineeId = assignment.user_id;
      const assignmentId = assignment.id;
      
      // Skip assignments that are already marked as completed at the assignment level
      // These are fully done and shouldn't appear in pending lists
      if (assignment.assignment_status === 'completed') {
        skippedCompleted++;
        continue;
      }
      
      // Use pre-fetched data instead of making queries
      const courseModules = modulesByCourse.get(courseId) || [];
      if (courseModules.length === 0) {
        skippedNoModules++;
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

      // Debug why assignments are filtered
      const debugInfo = {
        assignmentId: assignmentId.substring(0, 8),
        courseTitle: courseTitle.substring(0, 30),
        allDigitalComplete,
        onsiteTrainingModules: onsiteTrainingModules.length,
        onsiteTrainingComplete,
        isTrainerForCourse: trainerCourseIds.has(courseId),
        onsiteAssessmentModules: onsiteAssessmentModules.length,
        isAssessorForCourse: assessorCourseIds.has(courseId),
        trainingStageComplete
      };
      
      // Track why assignments don't show
      let wasProcessed = false;
      
      if (!allDigitalComplete) {
        digitalNotComplete++;
      } else if (onsiteTrainingModules.length === 0 && onsiteAssessmentModules.length === 0) {
        noOnsiteModules++;
      } else if (onsiteTrainingModules.length > 0 && onsiteTrainingComplete && 
                 onsiteAssessmentModules.length > 0 && onsiteAssessmentModules.every(m => completedModuleIds.has(m.id))) {
        allModulesComplete++;
      }

      // Add to pending training if digital complete but onsite training not done
      if (allDigitalComplete && onsiteTrainingModules.length > 0 && !onsiteTrainingComplete) {
        if (trainerCourseIds.has(courseId)) {
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
          processedCount++;
          wasProcessed = true;
        } else {
          notTrainerForCourse++;
        }
      }

      // Add to pending assessment if training stage is complete but assessment not done
      if (trainingStageComplete && onsiteAssessmentModules.length > 0) {
        const onsiteAssessmentComplete = onsiteAssessmentModules.every(m => completedModuleIds.has(m.id));
        if (!onsiteAssessmentComplete) {
          if (assessorCourseIds.has(courseId)) {
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
            processedCount++;
            wasProcessed = true;
          } else {
            notAssessorForCourse++;
          }
        }
      }
    }
    
    console.log('[Train-Assess] Processing complete:', {
      totalAssignments: traineeAssignments.length,
      skippedCompleted,
      skippedNoModules,
      digitalNotComplete,
      noOnsiteModules,
      allModulesComplete,
      notTrainerForCourse,
      notAssessorForCourse,
      processedCount,
      pendingTraining: pendingTrainingItems.length,
      pendingAssessment: pendingAssessmentItems.length,
      unaccounted: traineeAssignments.length - skippedCompleted - skippedNoModules - 
                   digitalNotComplete - noOnsiteModules - allModulesComplete - 
                   notTrainerForCourse - notAssessorForCourse - processedCount
    });
    
    // Log unique courses in pending items
    const uniqueCourses = new Set([
      ...pendingTrainingItems.map(i => i.course_title),
      ...pendingAssessmentItems.map(i => i.course_title)
    ]);
    console.log('[Train-Assess] Unique courses showing:', Array.from(uniqueCourses));
  }

  return renderPage(pendingTrainingItems, pendingAssessmentItems);
}

// Extracted rendering logic to keep it clean
function renderPage(pendingTrainingItems: PendingTrainingItem[], pendingAssessmentItems: PendingTrainingItem[]) {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Training & Assessment</h1>
        <p className="text-muted-foreground">
          Manage onsite training and assessments for your assigned courses.
        </p>
      </div>

      {/* Pending Onsite Training */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Pending Onsite Training
            <Badge variant="secondary">{pendingTrainingItems.length}</Badge>
          </CardTitle>
          <CardDescription>
            Trainees who have completed digital modules and are ready for onsite training.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingTrainingItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No pending onsite training sessions.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingTrainingItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{item.trainee_name}</span>
                      <span className="text-sm text-muted-foreground">({item.trainee_email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.course_title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Ready since {formatDateConsistent(item.created_at)}
                      </span>
                    </div>
                  </div>
                  <Link 
                      href={`/app/train-assess/course/${item.course_id}?trainee=${item.assignment_id}&type=training`}
                    >
                      <Button size="sm">
                        Start Training
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Onsite Assessment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Pending Onsite Assessment
            <Badge variant="secondary">{pendingAssessmentItems.length}</Badge>
          </CardTitle>
          <CardDescription>
            Trainees who have completed onsite training and are ready for assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingAssessmentItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No pending onsite assessments.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingAssessmentItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{item.trainee_name}</span>
                      <span className="text-sm text-muted-foreground">({item.trainee_email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.course_title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Ready since {formatDateConsistent(item.created_at)}
                      </span>
                    </div>
                  </div>
                  <Link href={`/app/train-assess/course/${item.course_id}?trainee=${item.assignment_id}&type=assessment`}>
                    <Button variant="outline">
                      Start Assessment
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Trainees appear in "Pending Training" after completing all digital modules</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>After onsite training is completed, they move to "Pending Assessment"</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span>Complete the assessment to finish their course journey</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}