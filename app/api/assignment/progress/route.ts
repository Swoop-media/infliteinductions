
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

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
    const completed = Boolean(body.completed);

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

    // Verify user owns this assignment
    const { data: assignment, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, course_id, user_id")
      .eq("id", assignmentId)
      .eq("user_id", user.id)
      .single();

    console.log("Assignment verification:", {
      assignment,
      error: assignmentErr?.message
    });

    if (assignmentErr || !assignment) {
      console.log("Assignment progress: No valid assignment found");
      return NextResponse.json({ error: "No valid assignment found" }, { status: 403 });
    }

    // Insert or update assignment progress
    if (completed) {
      const { error: upsertErr } = await supabase
        .from("assignment_progress")
        .upsert({
          assignment_id: assignmentId,
          module_id: moduleId,
          completed_at: new Date().toISOString()
        }, {
          onConflict: "assignment_id,module_id"
        });

      console.log("Assignment progress upsert:", {
        error: upsertErr?.message
      });

      if (upsertErr) {
        console.error("Assignment progress upsert error:", upsertErr);
        return NextResponse.json({ error: upsertErr.message }, { status: 400 });
      }

      // Try to complete the overall assignment if all modules are done
      try {
        await supabase.rpc("try_complete_assignment", { 
          p_assignment_id: assignmentId 
        });
      } catch (error) {
        console.warn("Failed to run try_complete_assignment RPC:", error);
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
