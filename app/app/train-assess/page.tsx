
import { createSupabaseServer } from "@/lib/supabase/server";
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

  console.log("Current user:", user.id);

  // Get user's role assignments for training and assessment
  const { data: trainerAssignments } = await supabase
    .from("course_assignments")
    .select("course_id, role")
    .eq("user_id", user.id)
    .in("role", ["onsite_trainer", "onsite_assessor"]);

  console.log("Trainer course IDs:", trainerAssignments?.map(a => a.course_id));

  const trainerCourseIds = trainerAssignments?.map(a => a.course_id) || [];
  const isOnsiteTrainer = trainerAssignments?.some(a => a.role === "onsite_trainer");
  const isOnsiteAssessor = trainerAssignments?.some(a => a.role === "onsite_assessor");

  let pendingTrainingItems: PendingTrainingItem[] = [];
  let pendingAssessmentItems: PendingTrainingItem[] = [];

  if (trainerCourseIds.length > 0) {
    // Get trainee assignments for courses where this user is a trainer/assessor
    const { data: traineeAssignments } = await supabase
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        created_at,
        courses!inner(title),
        profiles(full_name, email)
      `)
      .eq("role", "trainee")
      .in("course_id", trainerCourseIds);

    console.log("Trainee assignments found:", traineeAssignments?.length);

    if (traineeAssignments) {
      for (const assignment of traineeAssignments) {
        const courseId = assignment.course_id;
        const traineeId = assignment.user_id;
        const assignmentId = assignment.id;

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

        // Get trainee's progress
        const { data: progress } = await supabase
          .from("assignment_progress")
          .select("module_id")
          .eq("assignment_id", assignmentId);

        const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

        // Check if all digital modules are complete
        const allDigitalComplete = digitalModules.length > 0 &&
          digitalModules.every(m => completedModuleIds.has(m.id));

        // Check if onsite training is complete
        const onsiteTrainingComplete = onsiteTrainingModules.every(m => completedModuleIds.has(m.id));

        const traineeName = assignment.profiles?.full_name || assignment.profiles?.email || "Unknown";
        const traineeEmail = assignment.profiles?.email || "";

        // Add to pending training if digital complete but onsite training not done
        if (allDigitalComplete && !onsiteTrainingComplete && isOnsiteTrainer) {
          pendingTrainingItems.push({
            id: assignmentId,
            trainee_name: traineeName,
            trainee_email: traineeEmail,
            course_title: assignment.courses.title,
            course_id: courseId,
            assignment_id: assignmentId,
            created_at: assignment.created_at,
            type: 'training'
          });
        }

        // Add to pending assessment if onsite training complete but assessment not done
        if (onsiteTrainingComplete && onsiteAssessmentModules.length > 0 && isOnsiteAssessor) {
          const onsiteAssessmentComplete = onsiteAssessmentModules.every(m => completedModuleIds.has(m.id));
          if (!onsiteAssessmentComplete) {
            pendingAssessmentItems.push({
              id: assignmentId,
              trainee_name: traineeName,
              trainee_email: traineeEmail,
              course_title: assignment.courses.title,
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

  console.log("Final pending training items:", pendingTrainingItems.length);
  console.log("Final pending assessment items:", pendingAssessmentItems.length);

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
                  <Link href={`/app/train-assess/course/${item.course_id}?trainee=${item.assignment_id}&type=training`}>
                    <Button>
                      Start Training
                      <ArrowRight className="ml-2 h-4 w-4" />
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
