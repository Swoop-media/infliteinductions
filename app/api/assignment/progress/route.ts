
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/assignment/progress
 * Body: { assignmentId, moduleId }
 */
export async function POST(req: Request) {
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

    console.log("Assignment progress request:", {
      userId: user.id,
      assignmentId,
      moduleId,
      body
    });

    if (!assignmentId || !moduleId) {
      console.log("Assignment progress: Missing required fields");
      return NextResponse.json({ error: "Missing assignmentId or moduleId" }, { status: 400 });
    }

    // Verify user owns this assignment
    const { data: assignment, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id")
      .eq("id", assignmentId)
      .eq("user_id", user.id)
      .single();

    console.log("Assignment verification:", {
      assignment,
      error: assignmentErr?.message
    });

    if (assignmentErr || !assignment) {
      console.log("Assignment progress: Access denied");
      return NextResponse.json({ error: "Assignment not found or access denied" }, { status: 403 });
    }

    // Insert assignment progress (will be ignored if duplicate)
    const { error: insertErr, data: insertData } = await supabase
      .from("assignment_progress")
      .insert({ 
        assignment_id: assignmentId, 
        module_id: moduleId,
        created_at: new Date().toISOString()
      })
      .select();

    console.log("Assignment progress insert:", {
      insertPayload: { assignment_id: assignmentId, module_id: moduleId },
      data: insertData,
      error: insertErr?.message,
      errorCode: insertErr?.code,
      isDuplicate: insertErr?.message?.includes('duplicate') || insertErr?.code === '23505'
    });

    if (insertErr && !insertErr.message?.includes('duplicate')) {
      console.error("Assignment progress insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    // Verify the record was actually inserted
    const { data: verifyData, error: verifyError } = await supabase
      .from("assignment_progress")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("module_id", moduleId);

    console.log("Assignment progress verification:", {
      verifyData,
      verifyError: verifyError?.message,
      recordExists: verifyData && verifyData.length > 0
    });

    // Try to complete assignment if all modules are done
    try { 
      const { data: rpcData, error: rpcError } = await supabase.rpc("try_complete_assignment", { p_assignment_id: assignmentId }); 
      console.log("try_complete_assignment result:", { data: rpcData, error: rpcError?.message });
    } catch (e) {
      console.warn("Ignoring error calling try_complete_assignment:", e);
    }

    return NextResponse.json({ 
      ok: true, 
      inserted: !insertErr?.message?.includes('duplicate'),
      verified: verifyData && verifyData.length > 0,
      assignmentId,
      moduleId 
    });
  } catch (e: any) {
    console.error("Assignment progress POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
