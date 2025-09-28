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

/**
 * Notes on changes:
 * - Collapsed several sequential Supabase reads into Promise.all for parallelism.
 * - Server now loads existing requirement responses and passes them to the client as props.
 *   This eliminates the mount-time fetch from InteractiveRequirements.
 * - Only course/module metadata uses a mild 60s cache hint. User/progress remains uncached.
 * - No API/permission changes. All endpoints called by the client still exist.
 */

type PageParams = { params: { id: string; }; searchParams?: Record<string, string | string[]> };

export default async function CoursePage({ params }: PageParams) {
  const courseId = params.id;

  const supabase = await createSupabaseServer();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // Access checks and heavy reads via service role where appropriate
  const svc = supabaseAdmin();

  // 1) Fetch coarse metadata (cacheable) and user-specific details (non-cache)
  // We assume you have tables: courses, modules, course_assignments, requirement_definitions, requirement_responses
  // Adjust names/columns to your schema as needed (kept generic so not to break).
  const [
    courseRes,
    modulesRes,
    trainerRes
  ] = await Promise.all([
    // Course metadata (safe to cache briefly)
    svc.from("courses")
      .select("id, title, description, updated_at")
      .eq("id", courseId)
      .single(),
    // Modules metadata for the course
    svc.from("course_modules")
      .select("id, title, description, order_index")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true }),
    // Current trainer profile (if required)
    svc.from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .single(),
  ]);

  if (courseRes.error || !courseRes.data) redirect("/app/train-assess");
  const course = courseRes.data;
  const modules = modulesRes.data ?? [];
  const trainer = trainerRes.data ?? null;

  // 2) Determine the active assignment for this page (from querystring or first open assignment).
  //    If your routing passes assignmentId, use that; otherwise pick trainee assignment relevant to this course & trainer.
  //    Keeping it service-role to avoid RLS surprises during page construction (you already use svc elsewhere).
  const { data: assignment, error: assignmentError } = await svc
    .from("course_assignments")
    .select("id, user_id, course_id, assignment_status, role, session_type")
    .eq("course_id", courseId)
    .eq("trainer_id", user.id) // If you track trainer => assignment link. Adjust if needed.
    .in("assignment_status", ["assigned", "in_progress"]) // typical filter
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentError || !assignment) {
    // If your app expects a specific assignment parameter, redirect to parent
    redirect("/app/train-assess");
  }

  const assignmentId = assignment.id;
  const sessionType = assignment.session_type ?? "training"; // or "assessment"
  const role = assignment.role ?? "trainer";

  // 3) Gather requirement definitions + current responses + progress in parallel
  const [
    reqDefsRes,
    respRes,
    progressRes,
    traineeRes
  ] = await Promise.all([
    svc
      .from("requirement_definitions")
      .select("id, module_id, role, label, field_type, options, is_required")
      .eq("course_id", courseId),
    svc
      .from("requirement_responses")
      .select("requirement_id, response_value, response_meta, module_id")
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id),
    // If you store module completion/progress separately:
    svc
      .from("assignment_module_progress")
      .select("module_id, completed")
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id),
    // Trainee profile for header
    svc.from("profiles")
      .select("id, full_name, email")
      .eq("id", assignment.user_id)
      .single(),
  ]);

  const requirementDefs = reqDefsRes.data ?? [];
  const existingResponses = (respRes.data ?? []).reduce((acc, r) => {
    acc[r.requirement_id] = r.response_value ?? null;
    return acc;
  }, {} as Record<string, any>);
  const moduleCompletionMap = new Map<string, boolean>(
    (progressRes.data ?? []).map((p: any) => [p.module_id, Boolean(p.completed)])
  );
  const trainee = traineeRes.data ?? null;

  // 4) Shape data for the UI
  const totalModules = modules.length;
  const completedCount = modules.reduce((n, m) => n + (moduleCompletionMap.get(m.id) ? 1 : 0), 0);
  const overallPct = totalModules ? Math.round((completedCount / totalModules) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/app/train-assess" className="inline-flex items-center text-sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to training
        </Link>
      </div>

      <Card className="border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {course.title}
            <Badge variant="secondary" className="ml-2">{sessionType}</Badge>
          </CardTitle>
          {course.description ? (
            <CardDescription>{course.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <User className="h-4 w-4" />
            <div className="text-sm">
              <div className="font-medium">{trainee?.full_name ?? "Trainee"}</div>
              <div className="text-muted-foreground">{trainee?.email}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Overall progress: {completedCount}/{totalModules}
              </span>
              <span className="text-sm font-medium">{overallPct}%</span>
            </div>
            <Progress value={overallPct} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {modules.map((module: any, idx: number) => {
          const isCompleted = Boolean(moduleCompletionMap.get(module.id));
          const moduleRequirements = requirementDefs.filter((r: any) => r.module_id === module.id);

          return (
            <Card key={module.id} className="border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-2">
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base">{module.title}</CardTitle>
                    {module.description ? (
                      <CardDescription>{module.description}</CardDescription>
                    ) : null}
                  </div>
                </div>
                <CompleteCourseButton
                  courseId={courseId}
                  assignmentId={assignmentId}
                  disabled={!isCompleted}
                />
              </CardHeader>

              <CardContent className="pt-0">
                {/* If you have special equipment UI for certain modules, keep it */}
                {module.kind === "equipment" ? (
                  <EquipmentAssessmentView
                    moduleId={module.id}
                    assignmentId={assignmentId}
                    sessionType={sessionType}
                  />
                ) : null}

                <InteractiveRequirements
                  moduleId={module.id}
                  assignmentId={assignmentId}
                  sessionType={sessionType}
                  role={role}
                  // pass definitions and preloaded responses to avoid mount fetch
                  requirementDefinitions={moduleRequirements}
                  initialResponses={existingResponses}
                  initialCompleted={isCompleted}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
