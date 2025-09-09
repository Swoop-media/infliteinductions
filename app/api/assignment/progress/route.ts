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

    // Get the assignment to verify it exists
  const { data: assignment, error: assignmentError } = await supabase
    .from('course_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (assignmentError) {
    console.error('Assignment query error:', assignmentError);
    return NextResponse.json({ 
      error: 'Database error while fetching assignment',
      details: assignmentError.message 
    }, { status: 500 });
  }

  if (!assignment) {
    console.error('No assignment found for ID:', assignmentId);
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

    // Verify user can manage this assignment (either as the trainee or as a trainer/assessor)
    const { data: assignmentCheck, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, course_id, user_id")
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

    // Check if user is the trainee (owns the assignment) OR is a trainer/assessor for this course
    const isTrainee = assignmentCheck.user_id === user.id;
    let isTrainerOrAssessor = false;

    if (!isTrainee) {
      const { data: trainerRoles } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", assignmentCheck.course_id)
        .in("role", ["onsite_trainer", "onsite_assessor"]);

      isTrainerOrAssessor = Boolean(trainerRoles && trainerRoles.length > 0);
    }

    if (!isTrainee && !isTrainerOrAssessor) {
      console.log("Assignment progress: User not authorized to manage this assignment");
      return NextResponse.json({ error: "Not authorized to manage this assignment" }, { status: 403 });
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