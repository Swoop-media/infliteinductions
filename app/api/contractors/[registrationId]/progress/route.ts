import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { registrationId } = await params;
    const { completed_modules } = await request.json();

    if (!Array.isArray(completed_modules)) {
      return NextResponse.json(
        { error: "completed_modules must be an array" },
        { status: 400 }
      );
    }

    // Update progress data
    const { error } = await (supabase as any)
      .from("contractor_registrations")
      .update({
        completed_modules: completed_modules,
        updated_at: new Date().toISOString(),
      })
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