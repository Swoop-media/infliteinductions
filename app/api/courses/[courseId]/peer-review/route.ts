// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const supabase = await createSupabaseServer();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only course creators, senior management, or admins may record peer reviews
    // (mirrors the access gating used by the creator area)
    const [isCreator, isManager, isAdmin] = await Promise.all([
      hasRole("Course Creators"),
      hasRole("Senior management"),
      hasRole("Admin"),
    ]);
    if (!isCreator && !isManager && !isAdmin) {
      return NextResponse.json(
        { error: "You do not have permission to record peer reviews" },
        { status: 403 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const reviewDate = typeof body.reviewDate === "string" ? body.reviewDate.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!reviewDate || !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
      return NextResponse.json({ error: "A valid review date is required" }, { status: 400 });
    }

    const adminClient = supabaseAdmin();

    // Verify the course exists
    const { data: course, error: courseError } = await adminClient
      .from("courses")
      .select("id, title")
      .eq("id", courseId)
      .maybeSingle();

    if (courseError || !course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Snapshot the reviewer's display name at time of review
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, first_name, last_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const reviewerName =
      profile?.full_name ||
      (profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : null) ||
      profile?.email ||
      user.email ||
      "Unknown reviewer";

    const { data: review, error: insertError } = await adminClient
      .from("course_peer_reviews")
      .insert({
        course_id: courseId,
        reviewer_id: user.id,
        reviewer_name: reviewerName,
        review_date: reviewDate,
        notes: notes || null,
      })
      .select("id, reviewer_name, review_date, notes, created_at")
      .single();

    if (insertError) {
      console.error("Failed to save peer review:", insertError);
      // Table not yet created in Supabase (migration not applied)
      if (insertError.code === "PGRST205" || insertError.code === "42P01") {
        return NextResponse.json(
          { error: "Peer review storage is not set up yet. Please contact an administrator." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
    }

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error("Peer review submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
