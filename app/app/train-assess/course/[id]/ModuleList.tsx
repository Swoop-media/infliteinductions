// @ts-nocheck

import { supabaseAdmin } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, User } from "lucide-react";
import InteractiveRequirements from "./InteractiveRequirements";
import EquipmentAssessmentView from "@/components/EquipmentAssessmentView";
import CompleteCourseButton from "./CompleteCourseButton";

type Props = {
  courseId: string;
  trainerId: string;
  modules: any[];
  requirementDefinitions: any[];
};

export default async function ModuleList({
  courseId,
  trainerId,
  modules,
  requirementDefinitions,
}: Props) {
  const svc = supabaseAdmin();

  // Pick the most recent “open” assignment for this trainer & course
  const { data: assignment } = await svc
    .from("course_assignments")
    .select("id, user_id, session_type, assignment_status, role")
    .eq("course_id", courseId)
    .eq("trainer_id", trainerId)
    .in("assignment_status", ["assigned", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assignment) {
    return <div className="text-sm text-muted-foreground">No active assignment found.</div>;
  }

  const { data: state, error } = await svc.rpc("get_assignment_state", {
    p_course_id: courseId,
    p_assignment_id: assignment.id,
    p_trainer_id: trainerId,
  });
  if (error || !state) {
    return <div className="text-sm text-red-600">Failed to load assignment.</div>;
  }

  const trainee = state.trainee;
  const progress = new Map<string, boolean>(
    (state.progress ?? []).map((p: any) => [p.module_id, Boolean(p.completed)])
  );
  const existingResponses = (state.responses ?? []).reduce((acc: Record<string, any>, r: any) => {
    acc[r.requirement_id] = r.response_value ?? null;
    return acc;
  }, {});
  const sessionType = assignment.session_type ?? "training";

  const totalModules = modules.length;
  const completedCount = modules.reduce((n, m) => n + (progress.get(m.id) ? 1 : 0), 0);
  const overallPct = totalModules ? Math.round((completedCount / totalModules) * 100) : 0;

  return (
    <>
      <Card className="border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <User className="h-4 w-4" />
            <div className="text-sm">
              <div className="font-medium">{trainee?.full_name ?? "Trainee"}</div>
              <div className="text-muted-foreground">{trainee?.email}</div>
            </div>
            <Badge variant="secondary" className="ml-auto">{sessionType}</Badge>
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

      <div className="grid gap-6 mt-6">
        {modules.map((module: any) => {
          const isCompleted = Boolean(progress.get(module.id));
          const moduleRequirements = requirementDefinitions.filter((r: any) => r.module_id === module.id);

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
                  assignmentId={assignment.id}
                  disabled={!isCompleted}
                />
              </CardHeader>

              <CardContent className="pt-0">
                {module.kind === "equipment" ? (
                  <EquipmentAssessmentView
                    moduleId={module.id}
                    assignmentId={assignment.id}
                    sessionType={sessionType}
                  />
                ) : null}

                <InteractiveRequirements
                  moduleId={module.id}
                  assignmentId={assignment.id}
                  sessionType={sessionType}
                  role={assignment.role}
                  requirementDefinitions={moduleRequirements}
                  initialResponses={existingResponses}
                  initialCompleted={isCompleted}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
