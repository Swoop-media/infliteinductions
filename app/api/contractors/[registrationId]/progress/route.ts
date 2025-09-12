import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { registrationId: string } }
) {
  try {
    const supabase = await createSupabaseServer();
    const { registrationId } = params;
    const { completed_modules } = await request.json();

    if (!Array.isArray(completed_modules)) {
      return NextResponse.json(
        { error: "completed_modules must be an array" },
        { status: 400 }
      );
    }

    // Update progress data
    const { error } = await supabase
      .from("contractor_course_completions")
      .update({
        progress_data: {
          completed_modules,
          last_updated: new Date().toISOString(),
        },
      } as any)
      .eq("id", registrationId);

    if (error) {
      console.error("Progress update error:", error);
      return NextResponse.json(
        { error: "Failed to update progress" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Progress updated successfully",
    });
  } catch (error) {
    console.error("Progress update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}