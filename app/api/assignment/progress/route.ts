// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordCourseCompletion } from "@/lib/training-history";
import { getPinnedCourseContext, findPinnedModule } from "@/lib/course-version";

// Helper function to check and update authorization status
// Delegates to the shared auto-fix module which evaluates ALL of the user's
// authorisation assignments (assigned AND in_progress), applies the correct
// status, and notifies Authorization Approvers when one becomes pending approval.
async function checkAndUpdateAuthorizationStatus(adminClient: any, userId: string, courseId: string) {
  try {
    console.log("Checking authorization completion for user:", userId, "course:", courseId);
    const { autoFixAuthorisationAssignments } = await import("@/lib/authorizations/auto-fix");
    const result = await autoFixAuthorisationAssignments({ userId, trigger: "course_completion" });
    if (result.fixed.length > 0) {
      console.log(`✅ Auto-fixed ${result.fixed.length} authorisation assignment(s) for user ${userId}`);
    }
    if (result.errors.length > 0) {
      console.error("Auto-fix errors:", result.errors);
    }
  } catch (error) {
    console.error("Error checking authorization completion:", error);
    // Don't fail the module completion if authorization check fails
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Must be logged in
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.log("Assignment progress: Unauthorized user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId || "");
    const moduleId = String(body.moduleId || "");
    const completed = body.completed !== undefined ? Boolean(body.completed) : true;

    console.log("Assignment progress request:", {
      userId: user.id,
      assignmentId,
      moduleId,
      completed
    });

    if (!assignmentId || !moduleId) {
      console.log("Assignment progress: Missing required fields");
      return NextResponse.json({ error: "Missing assignmentId or moduleId" }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const adminClient = supabaseAdmin();

    // Fail closed: every trainee assignment must resolve to an immutable pinned
    // version. Validate module identity and completion against the pinned
    // snapshot.modules, never against mutable live course_modules.
    let pinnedContext: any;
    try {
      pinnedContext = await getPinnedCourseContext(adminClient, { assignmentId });
    } catch (pinnedError: any) {
      console.log("Assignment progress: Pinned version unavailable", pinnedError?.message);
      return NextResponse.json(
        { error: pinnedError?.message || "Pinned course version is unavailable" },
        { status: 404 }
      );
    }

    const assignmentCheck = {
      id: pinnedContext.assignment.id,
      course_id: pinnedContext.assignment.course_id,
      user_id: pinnedContext.assignment.user_id,
      role: pinnedContext.assignment.role,
    };

    console.log("Assignment verification:", {
      assignment: assignmentCheck,
    });

    // Validate the module against the pinned snapshot, not live content.
    let moduleCheck: any;
    try {
      moduleCheck = findPinnedModule(pinnedContext, moduleId);
    } catch (moduleError: any) {
      console.log("Assignment progress: Module not part of pinned assignment", moduleError?.message);
      return NextResponse.json({ error: "Module not found in this course" }, { status: 400 });
    }

    // Check if user is authorized (trainee or trainer/assessor)
    const isTrainee = assignmentCheck.user_id === user.id;
    let isAuthorized = isTrainee;

    if (!isTrainee) {
      // Trainers/assessors may only complete onsite modules matching their role
      const requiredRole =
        moduleCheck.type === "onsite_training" ? "onsite_trainer" :
        moduleCheck.type === "onsite_assessment" ? "onsite_assessor" :
        null;

      if (!requiredRole) {
        console.log("Assignment progress: Non-trainee cannot complete module type", moduleCheck.type);
        return NextResponse.json({ error: "Not authorized to complete this module type" }, { status: 403 });
      }

      const { data: trainerRole } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", assignmentCheck.course_id)
        .eq("role", requiredRole)
        .limit(1)
        .maybeSingle();

      isAuthorized = Boolean(trainerRole);
    }

    if (!isAuthorized) {
      console.log("Assignment progress: User not authorized to manage this assignment");
      return NextResponse.json({ error: "Not authorized to manage this assignment" }, { status: 403 });
    }

    // Insert or update assignment progress
    if (completed) {
      const progressData = {
        assignment_id: assignmentId,
        module_id: moduleId,
        completed_at: new Date().toISOString()
      };

      // Upsert progress and check if course is complete in a single transaction
      const { error: upsertErr } = await adminClient
        .from("assignment_progress")
        .upsert(progressData, {
          onConflict: "assignment_id,module_id"
        });

      console.log("Assignment progress upsert:", {
        error: upsertErr?.message
      });

      if (upsertErr) {
        console.error("Assignment progress upsert error:", upsertErr);
        return NextResponse.json({ error: upsertErr.message }, { status: 400 });
      }

      // Check if all pinned modules for this assignment are completed. Use the
      // immutable snapshot.modules so mutating live content cannot change what
      // "complete" means for an in-flight assignment.
      const moduleIds = (pinnedContext.modules || [])
        .map((m: any) => m?.id)
        .filter(Boolean);
      
      // Get all completed modules for this assignment
      const { data: completedProgress } = await adminClient
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignmentId)
        .not("completed_at", "is", null);
      
      const completedModuleIds = completedProgress?.map(p => p.module_id) || [];
      const allModulesCompleted = moduleIds.length > 0 && moduleIds.every(id => completedModuleIds.includes(id));
      
      console.log("Module completion check:", {
        totalModules: moduleIds.length,
        completedModules: completedModuleIds.length,
        allModulesCompleted
      });
      
      // If all modules are completed, mark the course assignment as completed
      if (allModulesCompleted) {
        const completedAt = new Date().toISOString();
        try {
          // Fail closed: do not mark the reusable live assignment completed
          // unless its immutable version/evidence record is durable first.
          await recordCourseCompletion({
            assignmentId,
            completedAt,
            actorId: user.id,
            reason: "completion",
            adminClient,
          });
        } catch (historyError: any) {
          console.error("Failed to preserve immutable course completion:", historyError);
          return NextResponse.json(
            { error: historyError?.message || "Could not preserve training history" },
            { status: 500 }
          );
        }

        const { error: courseUpdateError } = await adminClient
          .from("course_assignments")
          .update({
            assignment_status: "completed",
            completed_at: completedAt
          })
          .eq("id", assignmentId);
        
        if (courseUpdateError) {
          console.error("Failed to update course assignment status:", courseUpdateError);
          return NextResponse.json(
            { error: "Failed to mark the course assignment as completed" },
            { status: 500 }
          );
        } else {
          console.log("Course assignment marked as completed:", assignmentId);
          
          // Now check if this completes any authorizations
          await checkAndUpdateAuthorizationStatus(adminClient, assignmentCheck.user_id, assignmentCheck.course_id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      completed,
      assignmentId,
      moduleId
    });

  } catch (error) {
    console.error("Assignment progress API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}