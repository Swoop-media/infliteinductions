
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId || "");
    const moduleId = String(body.moduleId || "");

    if (!assignmentId || !moduleId) {
      return NextResponse.json({ error: "Missing assignmentId or moduleId" }, { status: 400 });
    }

    // Verify user owns this assignment
    const { data: assignment, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id")
      .eq("id", assignmentId)
      .eq("user_id", user.id)
      .single();

    if (assignmentErr || !assignment) {
      return NextResponse.json({ error: "Assignment not found or access denied" }, { status: 403 });
    }

    // Insert assignment progress (will be ignored if duplicate)
    const { error: insertErr } = await supabase
      .from("assignment_progress")
      .insert({ 
        assignment_id: assignmentId, 
        module_id: moduleId 
      });

    if (insertErr && !insertErr.message?.includes('duplicate')) {
      console.error("Assignment progress insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    // Try to complete assignment if all modules are done
    try { 
      await supabase.rpc("try_complete_assignment", { p_assignment_id: assignmentId }); 
    } catch (e) {
      console.warn("Ignoring error calling try_complete_assignment:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Assignment progress POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
