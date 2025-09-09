import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/learner/progress
 * Body: { courseId, moduleId, blockId?, pageIndex, totalPages, completed }
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
      console.log("Learner progress: Unauthorized user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const courseId = String(body.courseId || "");
    const moduleId = String(body.moduleId || "");
    const blockId = body.blockId ? String(body.blockId) : null;
    const pageIndex = Number(body.pageIndex || 0);
    const totalPages = Number(body.totalPages || 0);
    const completed = Boolean(body.completed);

    console.log("Learner progress request:", {
      userId: user.id,
      courseId,
      moduleId,
      blockId,
      pageIndex,
      totalPages,
      completed
    });

    if (!courseId || !moduleId) {
      console.log("Learner progress: Missing required fields");
      return NextResponse.json({ error: "Missing courseId or moduleId" }, { status: 400 });
    }

    // Verify user has access to this course via enrolment
    const { data: enrolment, error: enrolmentErr } = await supabase
      .from("enrolments")
      .select("id, status")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .single();

    console.log("Enrolment verification:", {
      enrolment,
      error: enrolmentErr?.message
    });

    if (enrolmentErr || !enrolment || enrolment.status !== "approved") {
      console.log("Learner progress: No approved enrolment");
      return NextResponse.json({ error: "No approved enrolment found" }, { status: 403 });
    }

    // Insert or update learner progress
    const { error: upsertErr, data: upsertData } = await supabase
      .from("learner_progress")
      .upsert({
        user_id: user.id,
        course_id: courseId,
        module_id: moduleId,
        block_id: blockId,
        page_index: pageIndex,
        total_pages: totalPages,
        completed,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id,course_id,module_id"
      })
      .select();

    console.log("Learner progress upsert:", {
      data: upsertData,
      error: upsertErr?.message
    });

    if (upsertErr) {
      console.error("Learner progress upsert error:", upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    // If module is completed, also insert into module_progress for compatibility
    if (completed) {
      const { error: moduleProgressErr } = await supabase
        .from("module_progress")
        .insert({
          enrolment_id: enrolment.id,
          module_id: moduleId
        });

      if (moduleProgressErr && !moduleProgressErr.message?.includes('duplicate')) {
        console.warn("Module progress insert error:", moduleProgressErr);
      }
    }

    return NextResponse.json({ 
      ok: true, 
      courseId,
      moduleId,
      completed
    });
  } catch (e: any) {
    console.error("Learner progress POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
