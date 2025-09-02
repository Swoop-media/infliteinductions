
import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, User, BookOpen, ClipboardCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import CompleteModuleButton from "./CompleteModuleButton";

interface CoursePlayerProps {
  params: {
    id: string;
  };
  searchParams: {
    trainee?: string;
    type?: 'training' | 'assessment';
  };
}

export default async function CoursePlayerPage({ params, searchParams }: CoursePlayerProps) {
  const supabase = await createSupabaseServer();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const courseId = resolvedParams.id;
  const assignmentId = resolvedSearchParams.trainee;
  const sessionType = resolvedSearchParams.type || 'training';
  
  console.log("Course page params:", { courseId, assignmentId, sessionType });
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.log("❌ No user found, redirecting to login");
    redirect("/auth/login");
  }

  if (!assignmentId) {
    console.log("❌ No assignmentId provided, redirecting to train-assess");
    redirect("/app/train-assess");
  }

  console.log("✅ Assignment ID found:", assignmentId);

  // Get course info
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("title, description")
    .eq("id", courseId)
    .single();

  console.log("Course query result:", { course, courseError });

  if (!course) {
    console.log("❌ No course found, redirecting to train-assess");
    redirect("/app/train-assess");
  }

  // Get trainee assignment and profile
  const { data: assignment, error: assignmentError } = await supabase
    .from("course_assignments")
    .select(`
      id,
      user_id,
      course_id,
      profiles!course_assignments_user_id_fkey(full_name, email)
    `)
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .eq("role", "trainee")
    .single();

  console.log("Assignment query result:", { assignment, assignmentError });

  if (!assignment) {
    console.log("❌ No assignment found, redirecting to train-assess");
    redirect("/app/train-assess");
  }

  console.log("✅ Assignment found:", assignment.id);

  // Verify trainer/assessor has access to this course
  const { data: trainerAssignment, error: trainerError } = await supabase
    .from("course_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .in("role", ["onsite_trainer", "onsite_assessor"])
    .single();

  console.log("Trainer assignment query result:", { trainerAssignment, trainerError });

  if (!trainerAssignment) {
    console.log("❌ No trainer assignment found, redirecting to train-assess");
    redirect("/app/train-assess");
  }

  console.log("✅ Trainer assignment verified:", trainerAssignment.role);

  // Get course modules
  const moduleType = sessionType === 'training' ? 'onsite_training' : 'onsite_assessment';
  const { data: modules } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .eq("type", moduleType)
    .order("order_index");

  // Get trainee's progress
  const { data: progress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignmentId);

  const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

  const traineeName = assignment.profiles?.full_name || assignment.profiles?.email || "Unknown";
  const traineeEmail = assignment.profiles?.email || "";

  // Calculate progress
  const totalModules = modules?.length || 0;
  const completedModules = modules?.filter(m => completedModuleIds.has(m.id)).length || 0;
  const progressPercentage = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/app/train-assess">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Train & Assess
          </Button>
        </Link>
      </div>

      {/* Course and Trainee Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Course Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Course:</span>
              <span className="ml-2">{course.title}</span>
            </div>
            <div>
              <span className="font-medium">Session Type:</span>
              <Badge className="ml-2" variant={sessionType === 'training' ? 'default' : 'secondary'}>
                {sessionType === 'training' ? (
                  <>
                    <BookOpen className="h-3 w-3 mr-1" />
                    Onsite Training
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-3 w-3 mr-1" />
                    Onsite Assessment
                  </>
                )}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Trainee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Name:</span>
              <span className="ml-2">{traineeName}</span>
            </div>
            <div>
              <span className="font-medium">Email:</span>
              <span className="ml-2">{traineeEmail}</span>
            </div>
            <div>
              <span className="font-medium">Progress:</span>
              <div className="mt-2">
                <Progress value={progressPercentage} className="w-full" />
                <p className="text-sm text-muted-foreground mt-1">
                  {completedModules} of {totalModules} modules completed ({Math.round(progressPercentage)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modules */}
      <Card>
        <CardHeader>
          <CardTitle>
            {sessionType === 'training' ? 'Training Modules' : 'Assessment Modules'}
          </CardTitle>
          <CardDescription>
            {sessionType === 'training' 
              ? 'Complete each training module with the trainee'
              : 'Conduct assessments for each module'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!modules || modules.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No {sessionType} modules found for this course.
            </p>
          ) : (
            <div className="space-y-4">
              {modules.map((module, index) => {
                const isCompleted = completedModuleIds.has(module.id);
                
                return (
                  <div
                    key={module.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      isCompleted ? 'bg-green-50 border-green-200' : 'bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2">
                        {isCompleted ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium">{module.title}</h3>
                        {module.description && (
                          <p className="text-sm text-muted-foreground">{module.description}</p>
                        )}
                        {isCompleted && (
                          <p className="text-xs text-green-600 mt-1">
                            Completed {new Date(progress?.find(p => p.module_id === module.id)?.completed_at || '').toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Completed
                        </Badge>
                      ) : (
                        <CompleteModuleButton
                          moduleId={module.id}
                          assignmentId={assignmentId}
                          sessionType={sessionType}
                          isCompleted={isCompleted}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {progressPercentage === 100 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">Session Complete!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              {traineeName} has successfully completed all {sessionType} modules for "{course.title}".
              {sessionType === 'training' && ' They are now ready for onsite assessment.'}
            </p>
            <Link href="/app/train-assess" className="mt-4 inline-block">
              <Button>Return to Train & Assess Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
