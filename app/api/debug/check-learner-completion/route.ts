import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const courseId = searchParams.get("courseId");

  if (!userId || !courseId) {
    return NextResponse.json({ error: "Missing userId or courseId" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    const debug: any = {
      userId,
      courseId,
      checks: {}
    };

    // 1. Get learner info
    const { data: learner, error: learnerError } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    debug.learner = { learner, error: learnerError };

    // 2. Get course info
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    debug.course = { course, error: courseError };

    // 3. Check if learner has assignment or enrolment
    const { data: assignment, error: assignmentError } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .maybeSingle();

    const { data: enrolment, error: enrolmentError } = await supabase
      .from("course_enrolments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();

    debug.checks.access = {
      assignment: { data: assignment, error: assignmentError },
      enrolment: { data: enrolment, error: enrolmentError },
      hasAccess: !!(assignment || enrolment)
    };

    // 4. Get all modules in course
    const { data: allModules, error: modulesError } = await supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("type")
      .order("order_index");

    debug.checks.modules = {
      all: allModules,
      error: modulesError,
      digitalModules: allModules?.filter(m => ['digital_training', 'digital_assessment_quiz'].includes(m.type)) || [],
      onsiteTraining: allModules?.find(m => m.type === 'onsite_training'),
      onsiteAssessment: allModules?.find(m => m.type === 'onsite_assessment')
    };

    // 5. Check progress based on assignment vs enrolment
    let completedModules: any[] = [];

    if (assignment) {
      const { data: assignmentProgress, error: progressError } = await supabase
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignment.id);

      debug.checks.progress = {
        type: "assignment",
        assignmentId: assignment.id,
        data: assignmentProgress,
        error: progressError
      };

      completedModules = assignmentProgress || [];
    } else if (enrolment) {
      const { data: moduleProgress, error: progressError } = await supabase
        .from("module_progress")
        .select("module_id")
        .eq("enrolment_id", enrolment.id);

      debug.checks.progress = {
        type: "enrolment",
        enrolmentId: enrolment.id,
        data: moduleProgress,
        error: progressError
      };

      completedModules = moduleProgress || [];
    }

    const completedModuleIds = completedModules.map(p => p.module_id);
    const digitalModules = debug.checks.modules.digitalModules;
    const completedDigitalModules = digitalModules.filter(m => completedModuleIds.includes(m.id));

    debug.checks.digitalProgress = {
      totalDigital: digitalModules.length,
      completedDigital: completedDigitalModules.length,
      completedDigitalIds: completedDigitalModules.map(m => m.id),
      allDigitalComplete: completedDigitalModules.length === digitalModules.length,
      digitalModules: digitalModules.map(m => ({
        id: m.id,
        title: m.title,
        type: m.type,
        completed: completedModuleIds.includes(m.id)
      }))
    };

    // 6. Check onsite training status
    const onsiteTrainingModule = debug.checks.modules.onsiteTraining;
    const onsiteTrainingCompleted = onsiteTrainingModule && completedModuleIds.includes(onsiteTrainingModule.id);

    debug.checks.onsiteStatus = {
      hasOnsiteTraining: !!onsiteTrainingModule,
      onsiteCompleted: onsiteTrainingCompleted,
      onsiteModuleId: onsiteTrainingModule?.id
    };

    // 7. Check notification trigger conditions
    const shouldTrigger = debug.checks.digitalProgress.allDigitalComplete && 
                         debug.checks.onsiteStatus.hasOnsiteTraining && 
                         !debug.checks.onsiteStatus.onsiteCompleted;

    debug.checks.triggerConditions = {
      allDigitalComplete: debug.checks.digitalProgress.allDigitalComplete,
      hasOnsiteTraining: debug.checks.onsiteStatus.hasOnsiteTraining,
      onsiteNotCompleted: !debug.checks.onsiteStatus.onsiteCompleted,
      shouldTriggerNotification: shouldTrigger
    };

    // 8. Check for existing notifications
    const { data: notifications, error: notificationsError } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "onsite_training_ready")
      .like("payload->>course_id", `%${courseId}%`)
      .like("payload->>learner_id", `%${userId}%`)
      .order("created_at", { ascending: false });

    debug.checks.notifications = {
      existing: notifications,
      count: notifications?.length || 0,
      error: notificationsError
    };

    // 10. Check onsite trainers for this course
    const { data: trainers, error: trainersError } = await supabase
      .from("course_assignments")
      .select(`
        user_id,
        profiles!course_assignments_user_fk(full_name, email)
      `)
      .eq("course_id", courseId)
      .eq("role", "onsite_trainer");

    debug.checks.trainers = {
      count: trainers?.length || 0,
      trainers: trainers?.map(t => ({
        user_id: t.user_id,
        name: (t as any).profiles.full_name,
        email: (t as any).profiles.email
      })),
      error: trainersError
    };

    return NextResponse.json(debug);

  } catch (error) {
    return NextResponse.json({ 
      error: "Debug failed", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}