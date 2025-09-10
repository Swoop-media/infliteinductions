// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId } = await params;
    
    // Get all completed assignments for this course
    const { data: completedAssignments, error } = await supabase
      .from("course_assignments")
      .select(`
        id,
        user_id,
        completed_at,
        profiles!course_assignments_user_fk(
          full_name,
          email
        )
      `)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null);

    if (error) {
      console.error("Error fetching completed trainees:", error);
      return NextResponse.json({ error: "Failed to fetch completed trainees" }, { status: 500 });
    }

    const completedTrainees = (completedAssignments || []).map(assignment => ({
      user_id: assignment.user_id,
      assignment_id: assignment.id,
      completed_at: assignment.completed_at,
      full_name: assignment.profiles?.full_name || null,
      email: assignment.profiles?.email || null,
    }));

    return NextResponse.json(completedTrainees);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}