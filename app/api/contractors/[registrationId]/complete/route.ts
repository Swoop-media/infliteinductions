import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { registrationId } = await params;
    const { final_score } = await request.json();

    // Update completion record
    const { error } = await (supabase as any)
      .from("contractor_registrations")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
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