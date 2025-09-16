import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    
    if (!courseId) {
      return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Fetch equipment requirements directly from equipment_templates table
    const { data: equipment, error } = await supabase
      .from("equipment_templates")
      .select("*")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true });
    
    if (error) {
      console.error("Error fetching equipment:", error);
      return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }

    return NextResponse.json(equipment || []);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}