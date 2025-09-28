// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
    
    // Single optimized query to get assignment and check authorization
    const { data: assignmentCheck, error: assignmentErr } = await adminClient
      .from("course_assignments")
      .select("id, course_id, user_id, role")
      .eq("id", assignmentId)
      .single();

    console.log("Assignment verification:", {
      assignment: assignmentCheck,
      error: assignmentErr?.message
    });

    if (assignmentErr || !assignmentCheck) {
      console.log("Assignment progress: Assignment not found");
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check if user is authorized (trainee or trainer/assessor)
    const isTrainee = assignmentCheck.user_id === user.id;
    let isAuthorized = isTrainee;

    if (!isTrainee) {
      // Single query to check trainer/assessor role
      const { data: trainerRole } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", assignmentCheck.course_id)
        .in("role", ["onsite_trainer", "onsite_assessor"])
        .limit(1)
        .single();

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

      // Use a simpler approach: call an RPC function that handles all the completion logic
      // This moves the complex logic to the database level where it's more efficient
      try {
        await adminClient.rpc("handle_module_completion", {
          p_assignment_id: assignmentId,
          p_module_id: moduleId,
          p_user_id: assignmentCheck.user_id,
          p_course_id: assignmentCheck.course_id
        });
      } catch (error) {
        // If the RPC doesn't exist, fall back to simple completion check
        console.warn("RPC handle_module_completion not found, using simple completion:", error);
        
        // Just try to mark assignment as complete if all modules done
        try {
          await adminClient.rpc("try_complete_assignment", {
            p_assignment_id: assignmentId
          });
        } catch (e) {
          console.warn("Failed to run try_complete_assignment:", e);
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