import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { courseId, contractorName, contractorEmail, siteId } = await request.json();

    // Validate required fields
    if (!courseId || !contractorName || !contractorEmail || !siteId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contractorEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Check if course exists and is available for contractors
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, title, external_contractors")
      .eq("id", courseId)
      .eq("status", "published")
      .single();

    if (courseError || !course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    if (!(course as any).external_contractors) {
      return NextResponse.json(
        { error: "Course not available for external contractors" },
        { status: 403 }
      );
    }

    // Check if site exists
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id")
      .eq("id", siteId)
      .eq("active", true)
      .single();

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Invalid site selection" },
        { status: 400 }
      );
    }

    // Create contractor course completion record
    const { data: completion, error: insertError } = await supabase
      .from("contractor_course_completions")
      .insert({
        course_id: courseId,
        contractor_name: contractorName,
        contractor_email: contractorEmail,
        site_id: siteId,
        started_at: new Date().toISOString(),
        progress_data: {}
      } as any)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to register contractor" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: (completion as any).id,
      message: "Contractor registered successfully"
    });

  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}