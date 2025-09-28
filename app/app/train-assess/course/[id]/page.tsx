// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, User, BookOpen, ClipboardCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import InteractiveRequirements from "./InteractiveRequirements";
import EquipmentAssessmentView from "@/components/EquipmentAssessmentView";
import CompleteCourseButton from "./CompleteCourseButton";

async function saveRequirementResponses(moduleId: string, assignmentId: string, responses: Record<string, any>) {
  "use server";
  
  const supabase = await createSupabaseServer();
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Authentication required");
  }

  // Use admin client to bypass RLS when trainers save responses for trainees
  const supabaseService = supabaseAdmin();

  // Save or update requirement responses
  const responseEntries = Object.entries(responses).map(([requirementId, value]) => ({
    requirement_id: requirementId,
    module_id: moduleId,
    assignment_id: assignmentId,
    trainer_id: user.id,
    response_value: value,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  // First, delete existing responses for this module/assignment/trainer combination
  await supabaseService
    .from("requirement_responses")
    .delete()
    .eq("module_id", moduleId)
    .eq("assignment_id", assignmentId)
    .eq("trainer_id", user.id);

  // Insert new responses
  if (responseEntries.length > 0) {
    const { error } = await supabaseService
      .from("requirement_responses")
      .insert(responseEntries);
    
    if (error) {
      console.error("Error saving requirement responses:", error);
      throw new Error("Failed to save responses");
    }
  }

}

interface CoursePlayerProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    trainee?: string;
    type?: 'training' | 'assessment';
  }>;
}

export default async function CoursePlayerPage({ params, searchParams }: CoursePlayerProps) {
  const supabase = await createSupabaseServer();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const courseId = resolvedParams.id;
  const assignmentId = resolvedSearchParams.trainee;
  const sessionType = resolvedSearchParams.type || 'training';
  
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/auth/login");
  }

  if (!assignmentId) {
    redirect("/app/train-assess");
  }

  // FIRST: Verify trainer/assessor has access to this course (can have multiple roles)
  const { data: trainerAssignments, error: trainerError } = await supabase
    .from("course_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .in("role", ["onsite_trainer", "onsite_assessor"]);
  
  if (!trainerAssignments || trainerAssignments.length === 0) {
    redirect("/app/train-assess");
  }
  
  const userRoles = trainerAssignments.map(a => a.role);
  const requiredRole = sessionType === 'training' ? 'onsite_trainer' : 'onsite_assessor';
  const hasRequiredRole = userRoles.includes(requiredRole);
  
  if (!hasRequiredRole) {
    redirect("/app/train-assess");
  }

  // NOW: Get course info
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("title, description")
    .eq("id", courseId)
    .single();

  if (!course) {
    redirect("/app/train-assess");
  }

  // THEN: Get trainee assignment using SERVICE ROLE to bypass RLS
  // Since we already verified the trainer has access to this course
  const supabaseService = supabaseAdmin();
  const { data: assignment, error: assignmentError } = await supabaseService
    .from("course_assignments")
    .select("id, user_id, course_id, assignment_status")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .eq("role", "trainee")
    .maybeSingle();

  if (!assignment) {
    redirect("/app/train-assess");
  }
  
  // Get trainee profile using service role
  const { data: profile } = await supabaseService
    .from("profiles")
    .select("full_name, email")
    .eq("id", assignment.user_id)
    .single();


  // Get course modules
  const moduleType = sessionType === 'training' ? 'onsite_training' : 'onsite_assessment';
  const { data: modules } = await supabase
    .from("course_modules")
    .select("*, include_equipment_assessment")
    .eq("course_id", courseId)
    .eq("type", moduleType)
    .order("order_index");

  // Get onsite requirements for each module
  const moduleIds = modules?.map(m => m.id) || [];
  
  let requirementsByModule: Record<string, any[]> = {};
  if (moduleIds.length > 0) {
    // Fetch ALL requirements for the modules regardless of role value
    // This matches how the learner module fetches them
    // Security is handled by the role check above, not by filtering requirements
    const { data: requirements } = await supabase
      .from("onsite_requirements")
      .select("*")
      .in("module_id", moduleIds)
      .order("order_index");
    
    // Group requirements by module
    requirementsByModule = (requirements || []).reduce((acc, req) => {
      if (!acc[req.module_id]) acc[req.module_id] = [];
      acc[req.module_id].push(req);
      return acc;
    }, {} as Record<string, any[]>);
  }

  // Get trainee's progress
  const { data: progress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignmentId);

  const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

  const traineeName = profile?.full_name || profile?.email || "Unknown";
  const traineeEmail = profile?.email || "";

  // Calculate progress
  const totalModules = modules?.length || 0;
  const completedModules = modules?.filter(m => completedModuleIds.has(m.id)).length || 0;
  const progressPercentage = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;

  // Check if any pass_fail requirements have "fail" responses
  let hasFailedRequirements = false;
  if (sessionType === 'assessment' && user) {
    const { data: failResponses } = await supabase
      .from("requirement_responses")
      .select("response_value, requirement_id")
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id)
      .eq("response_value", "fail");
    
    if (failResponses && failResponses.length > 0) {
      // Check if these are actually pass_fail type requirements
      const failedReqIds = failResponses.map(r => r.requirement_id);
      const { data: requirements } = await supabase
        .from("onsite_requirements")
        .select("id, field_type")
        .in("id", failedReqIds)
        .eq("field_type", "pass_fail");
      
      hasFailedRequirements = requirements && requirements.length > 0;
    }
  }

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
            <div className="space-y-6">
              {modules.map((module, index) => {
                const isCompleted = completedModuleIds.has(module.id);
                const moduleRequirements = requirementsByModule[module.id] || [];
                
                return (
                  <div key={module.id} className="border rounded-lg bg-card">
                    {/* Module Header */}
                    <div className={`flex items-center justify-between p-4 border-b ${
                      isCompleted ? 'bg-green-50' : ''
                    }`}>
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
                        {isCompleted && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Completed
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Interactive Requirements */}
                    {moduleRequirements.length > 0 && (
                      <InteractiveRequirements
                        requirements={moduleRequirements}
                        moduleId={module.id}
                        isCompleted={isCompleted}
                        sessionType={sessionType}
                        assignmentId={assignmentId}
                        onSave={saveRequirementResponses}
                      />
                    )}

                    {/* Equipment Assessment Section - Only show for assessment modules with equipment assessment enabled */}
                    {sessionType === 'assessment' && module.include_equipment_assessment && (
                      <div className="p-4 border-t">
                        <EquipmentAssessmentView
                          courseId={courseId}
                          moduleId={module.id}
                          traineeId={assignment.user_id}
                          canEdit={!isCompleted}
                          onComplete={async () => {
                            'use server';
                            // Use admin client to bypass RLS for trainers marking trainee progress
                            const supabaseService = supabaseAdmin();
                            const { error } = await supabaseService
                              .from("assignment_progress")
                              .upsert({
                                assignment_id: assignmentId,
                                module_id: module.id,
                                completed_at: new Date().toISOString()
                              }, {
                                onConflict: "assignment_id,module_id"
                              });
                            if (error) {
                              console.error("Error marking module complete:", error);
                            }
                            // Force page refresh to update progress
                            redirect(`/app/train-assess/course/${courseId}?trainee=${assignmentId}&type=${sessionType}`);
                          }}
                        />
                      </div>
                    )}

                    {/* No Requirements Message */}
                    {moduleRequirements.length === 0 && !isCompleted && !module.include_equipment_assessment && (
                      <div className="p-4 text-center text-muted-foreground">
                        <p className="text-sm">No specific requirements configured for this module.</p>
                        <p className="text-xs mt-1">Use the "Complete Training" button when finished.</p>
                      </div>
                    )}
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
            <CardTitle className="text-green-800">
              {sessionType === 'assessment' ? 'Assessment Complete!' : 'Training Complete!'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              {traineeName} has successfully completed all {sessionType} modules for "{course.title}".
              {sessionType === 'training' && ' They are now ready for onsite assessment.'}
            </p>
            <div className="flex flex-col gap-3 mt-4">
              {sessionType === 'assessment' && hasFailedRequirements && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-medium">
                    ⚠️ Cannot complete course: Some requirements are marked as "Fail"
                  </p>
                  <p className="text-red-600 text-sm mt-1">
                    Please review and update the failed requirements above before completing the course.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                {sessionType === 'assessment' && assignment.assignment_status !== 'completed' && !hasFailedRequirements && (
                  <CompleteCourseButton 
                    courseId={courseId}
                    assignmentId={assignmentId}
                    traineeName={traineeName}
                  />
                )}
                <Link href="/app/train-assess">
                  <Button variant={sessionType === 'assessment' ? 'outline' : 'default'}>
                    Return to Train & Assess Dashboard
                  </Button>
                </Link>
              </div>
            </div>
            {assignment.assignment_status === 'completed' && (
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-sm text-green-800 font-medium">
                  ✅ Course marked as completed
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
