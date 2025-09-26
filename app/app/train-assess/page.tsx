// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, BookOpen, ClipboardCheck, ArrowRight } from "lucide-react";
import Link from "next/link";

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
  const { data: trainerAssignments, error: trainerError } = await supabase
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
    // Get trainee assignments for courses where this user is a trainer/assessor
    // Use service role client to bypass RLS and see all trainees
    const supabaseService = supabaseAdmin();
    
    // Batch query 1: Get all trainee assignments with profiles and courses in one query
    const { data: traineeAssignments, error: traineeError } = await supabaseService
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        created_at,
        profiles!inner(full_name, email),
        courses!inner(title)
      `)
      .eq("role", "trainee")
      .in("course_id", allCourseIds);

    if (!traineeAssignments || traineeAssignments.length === 0) {
      // No trainees to process
      return (
        <div className="container mx-auto py-6 space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Training & Assessment</h1>
            <p className="text-muted-foreground">
              Manage onsite training and assessments for your assigned courses.
            </p>
          </div>
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No pending training or assessment sessions.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Batch query 2: Get all modules for all relevant courses at once
    const { data: allCourseModules } = await supabase
      .from("course_modules")
      .select("id, type, title, course_id, order_index")
      .in("course_id", allCourseIds)
      .order("order_index");

    // Batch query 3: Get all assignment progress for all trainee assignments at once
    const assignmentIds = traineeAssignments.map(a => a.id);
    const { data: allProgress } = await supabase
      .from("assignment_progress")
      .select("module_id, assignment_id")
      .in("assignment_id", assignmentIds);

    // Create maps for efficient lookups
    const modulesByCourse = new Map();
    if (allCourseModules) {
      for (const module of allCourseModules) {
        if (!modulesByCourse.has(module.course_id)) {
          modulesByCourse.set(module.course_id, []);
        }
        modulesByCourse.get(module.course_id).push(module);
      }
    }

    const progressByAssignment = new Map();
    if (allProgress) {
      for (const prog of allProgress) {
        if (!progressByAssignment.has(prog.assignment_id)) {
          progressByAssignment.set(prog.assignment_id, new Set());
        }
        progressByAssignment.get(prog.assignment_id).add(prog.module_id);
      }
    }

    // Process assignments using in-memory data
    if (traineeAssignments) {
      for (const assignment of traineeAssignments) {
        const courseId = assignment.course_id;
        const traineeId = assignment.user_id;
        const assignmentId = assignment.id;
        
        // Get modules from map
        const allModules = modulesByCourse.get(courseId) || [];

        if (allModules.length === 0) {
          continue;
        }

        const digitalModules = allModules.filter(m =>
          m.type === "digital_training" || m.type === "digital_assessment_quiz"
        );
        const onsiteTrainingModules = allModules.filter(m => m.type === "onsite_training");
        const onsiteAssessmentModules = allModules.filter(m => m.type === "onsite_assessment");

        // Get progress from map
        const completedModuleIds = progressByAssignment.get(assignmentId) || new Set();

        // Check if all digital modules are complete (or if there are no digital modules)
        const allDigitalComplete = digitalModules.length === 0 || 
          digitalModules.every(m => completedModuleIds.has(m.id));

        // Check if onsite training is complete
        const onsiteTrainingComplete = onsiteTrainingModules.length > 0 && 
          onsiteTrainingModules.every(m => completedModuleIds.has(m.id));
        
        // Check if training stage is done or not required (for courses with only assessment)
        // For courses without training modules, require digital modules to be complete first
        const trainingStageComplete = onsiteTrainingModules.length === 0 
          ? allDigitalComplete 
          : onsiteTrainingComplete;

        // Get trainee and course info from joined data
        const traineeProfile = assignment.profiles;
        const courseInfo = assignment.courses;

        const traineeName = traineeProfile?.full_name || traineeProfile?.email || "Unknown";
        const traineeEmail = traineeProfile?.email || "";
        const courseTitle = courseInfo?.title || "Unknown Course";

        // Add to pending training if digital complete but onsite training not done
        // AND if current user is assigned as onsite_trainer for this specific course
        if (allDigitalComplete && onsiteTrainingModules.length > 0 && !onsiteTrainingComplete && trainerCourseIds.has(courseId)) {
          const trainingItem = {
            id: assignmentId,
            trainee_name: traineeName,
            trainee_email: traineeEmail,
            course_title: courseTitle,
            course_id: courseId,
            assignment_id: assignmentId,
            created_at: assignment.created_at,
            type: 'training'
          };
          pendingTrainingItems.push(trainingItem);
        }

        // Add to pending assessment if training stage is complete (or not required) but assessment not done
        // AND if current user is assigned as onsite_assessor for this specific course
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
              type: 'assessment'
            });
          }
        }
      }
    }
  }


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
                        Ready since {new Date(item.created_at).toLocaleDateString()}
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
                        Ready since {new Date(item.created_at).toLocaleDateString()}
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