
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const courseId = searchParams.get('courseId');
  
  if (!userId || !courseId) {
    return NextResponse.json({ error: "Missing userId or courseId" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const debug = {
    userId,
    courseId,
    timestamp: new Date().toISOString(),
    checks: {} as any
  };

  try {
    // 1. Check if user has assignment for this course
    const { data: assignment, error: assignmentError } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .maybeSingle();

    debug.checks.assignment = {
      found: !!assignment,
      data: assignment,
      error: assignmentError
    };

    if (!assignment) {
      debug.checks.assignment.message = "No trainee assignment found - trigger won't fire for assignments";
    }

    // 2. Check course modules
    const { data: modules, error: modulesError } = await supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("order_index");

    debug.checks.modules = {
      total: modules?.length || 0,
      data: modules,
      error: modulesError
    };

    const digitalModules = modules?.filter(m => 
      m.type === 'digital_training' || m.type === 'digital_assessment_quiz'
    ) || [];
    
    const onsiteTrainingModule = modules?.find(m => m.type === 'onsite_training');
    const onsiteAssessmentModule = modules?.find(m => m.type === 'onsite_assessment');

    debug.checks.moduleBreakdown = {
      digitalModules: digitalModules.map(m => ({ id: m.id, title: m.title, type: m.type })),
      onsiteTrainingModule: onsiteTrainingModule ? { id: onsiteTrainingModule.id, title: onsiteTrainingModule.title } : null,
      onsiteAssessmentModule: onsiteAssessmentModule ? { id: onsiteAssessmentModule.id, title: onsiteAssessmentModule.title } : null
    };

    // 3. Check assignment progress
    if (assignment) {
      const { data: assignmentProgress, error: progressError } = await supabase
        .from("assignment_progress")
        .select("*")
        .eq("assignment_id", assignment.id);

      debug.checks.assignmentProgress = {
        total: assignmentProgress?.length || 0,
        completed: assignmentProgress?.map(p => ({ 
          module_id: p.module_id, 
          created_at: p.created_at 
        })),
        error: progressError
      };

      // Check which digital modules are completed
      const completedDigitalModules = digitalModules.filter(dm => 
        assignmentProgress?.some(ap => ap.module_id === dm.id)
      );

      debug.checks.digitalProgress = {
        totalDigitalModules: digitalModules.length,
        completedDigitalModules: completedDigitalModules.length,
        completedModuleIds: completedDigitalModules.map(m => m.id),
        allDigitalComplete: completedDigitalModules.length === digitalModules.length
      };

      // Check if onsite training is completed
      const onsiteTrainingProgress = onsiteTrainingModule ? 
        assignmentProgress?.find(ap => ap.module_id === onsiteTrainingModule.id) : null;

      debug.checks.onsiteTrainingStatus = {
        hasOnsiteTrainingModule: !!onsiteTrainingModule,
        onsiteTrainingCompleted: !!onsiteTrainingProgress,
        onsiteTrainingProgress: onsiteTrainingProgress
      };
    }

    // 4. Check onsite trainers for this course
    const { data: trainers, error: trainersError } = await supabase
      .from("course_assignments")
      .select(`
        user_id,
        role,
        profiles!inner(name, email)
      `)
      .eq("course_id", courseId)
      .eq("role", "onsite_trainer");

    debug.checks.onsiteTrainers = {
      count: trainers?.length || 0,
      trainers: trainers?.map(t => ({
        user_id: t.user_id,
        name: (t as any).profiles.name,
        email: (t as any).profiles.email
      })),
      error: trainersError
    };

    // 5. Check existing notifications
    const { data: notifications, error: notificationsError } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "onsite_training_ready")
      .like("payload->>course_id", `%${courseId}%`)
      .like("payload->>learner_id", `%${userId}%`);

    debug.checks.existingNotifications = {
      count: notifications?.length || 0,
      notifications: notifications,
      error: notificationsError
    };

    // 6. Trigger condition analysis
    debug.checks.triggerAnalysis = {
      shouldTrigger: false,
      reasons: []
    };

    if (!assignment) {
      debug.checks.triggerAnalysis.reasons.push("No trainee assignment found");
    } else if (digitalModules.length === 0) {
      debug.checks.triggerAnalysis.reasons.push("No digital modules in course");
    } else if (!onsiteTrainingModule) {
      debug.checks.triggerAnalysis.reasons.push("No onsite training module in course");
    } else if (debug.checks.digitalProgress?.allDigitalComplete && !debug.checks.onsiteTrainingStatus?.onsiteTrainingCompleted) {
      debug.checks.triggerAnalysis.shouldTrigger = true;
      debug.checks.triggerAnalysis.reasons.push("All conditions met - should trigger notification");
    } else {
      if (!debug.checks.digitalProgress?.allDigitalComplete) {
        debug.checks.triggerAnalysis.reasons.push(`Digital modules incomplete: ${debug.checks.digitalProgress?.completedDigitalModules}/${debug.checks.digitalProgress?.totalDigitalModules}`);
      }
      if (debug.checks.onsiteTrainingStatus?.onsiteTrainingCompleted) {
        debug.checks.triggerAnalysis.reasons.push("Onsite training already completed");
      }
    }

    return NextResponse.json(debug);

  } catch (error) {
    return NextResponse.json({ 
      error: "Debug failed", 
      details: error instanceof Error ? error.message : String(error),
      debug 
    }, { status: 500 });
  }
}
