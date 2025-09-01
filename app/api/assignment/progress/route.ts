
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/assignment/progress
 * Body: { assignmentId, moduleId }
 */
export async function POST(req: Request) {
  try {
    console.log("🔄 Assignment progress API called");
    const supabase = await createSupabaseServer();

    // Must be logged in
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      console.log("❌ Assignment progress: Unauthorized user", { userErr: userErr?.message });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId || "");
    const moduleId = String(body.moduleId || "");

    console.log("📋 Assignment progress request:", {
      userId: user.id,
      assignmentId,
      moduleId,
      hasAssignmentId: !!assignmentId,
      hasModuleId: !!moduleId,
      bodyKeys: Object.keys(body)
    });

    if (!assignmentId || !moduleId) {
      console.log("❌ Assignment progress: Missing required fields", { assignmentId, moduleId });
      return NextResponse.json({ error: "Missing assignmentId or moduleId" }, { status: 400 });
    }

    // Verify user owns this assignment
    const { data: assignment, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id")
      .eq("id", assignmentId)
      .eq("user_id", user.id)
      .single();

    console.log("🔍 Assignment verification:", {
      assignmentId,
      userId: user.id,
      found: !!assignment,
      assignment,
      error: assignmentErr?.message,
      errorCode: assignmentErr?.code
    });

    if (assignmentErr || !assignment) {
      console.log("❌ Assignment progress: Access denied");
      return NextResponse.json({ error: "Assignment not found or access denied" }, { status: 403 });
    }

    // Insert assignment progress (will be ignored if duplicate)
    const insertPayload = { 
      assignment_id: assignmentId, 
      module_id: moduleId,
      created_at: new Date().toISOString()
    };

    console.log("💾 Attempting to insert assignment progress:", insertPayload);

    const { error: insertErr, data: insertData } = await supabase
      .from("assignment_progress")
      .insert(insertPayload)
      .select();

    console.log("📝 Assignment progress insert result:", {
      success: !insertErr,
      data: insertData,
      error: insertErr?.message,
      errorCode: insertErr?.code,
      isDuplicate: insertErr?.message?.includes('duplicate') || insertErr?.code === '23505',
      insertedCount: insertData?.length || 0
    });

    if (insertErr && !insertErr.message?.includes('duplicate') && insertErr?.code !== '23505') {
      console.error("❌ Assignment progress insert error:", insertErr);
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

    const response = { 
      ok: true, 
      inserted: !insertErr || insertErr?.code === '23505',
      verified: verifyData && verifyData.length > 0,
      assignmentId,
      moduleId,
      wasNewRecord: !insertErr,
      wasDuplicate: insertErr?.code === '23505'
    };

    console.log("✅ Assignment progress API response:", response);
    return NextResponse.json(response);
  } catch (e: any) {
    console.error("❌ Assignment progress POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
