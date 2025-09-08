
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get('moduleId');
    const assignmentId = searchParams.get('assignmentId');

    if (!moduleId || !assignmentId) {
      return NextResponse.json({ error: "Missing moduleId or assignmentId" }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get existing responses for this module/assignment/trainer
    const { data: responses, error } = await supabase
      .from("requirement_responses")
      .select("requirement_id, response_value")
      .eq("module_id", moduleId)
      .eq("assignment_id", assignmentId)
      .eq("trainer_id", user.id);

    if (error) {
      console.error("Error fetching requirement responses:", error);
      return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
    }

    return NextResponse.json({ responses: responses || [] });

  } catch (error) {
    console.error("Requirement responses API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
