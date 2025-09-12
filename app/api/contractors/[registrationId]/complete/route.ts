import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { registrationId: string } }
) {
  try {
    const supabase = await createSupabaseServer();
    const { registrationId } = params;
    const { final_score } = await request.json();

    // Update completion record
    const { error } = await supabase
      .from("contractor_course_completions")
      .update({
        completed_at: new Date().toISOString(),
        final_score: final_score || null,
        certificate_issued: false, // Will be handled separately if needed
      } as any)
      .eq("id", registrationId);

    if (error) {
      console.error("Course completion error:", error);
      return NextResponse.json(
        { error: "Failed to complete course" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Course completed successfully",
    });
  } catch (error) {
    console.error("Course completion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}