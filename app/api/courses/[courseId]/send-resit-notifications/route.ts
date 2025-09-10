// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(
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
    const body = await request.json();
    const { selectedTrainees } = body;

    if (!selectedTrainees || selectedTrainees.length === 0) {
      return NextResponse.json({ error: "No trainees selected" }, { status: 400 });
    }

    // Get course details
    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    const courseTitle = course?.title || "Course";

    // Get current user for notification context
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const senderName = senderProfile?.full_name || "Course Creator";

    // Send notifications to each selected trainee
    const { createNotification } = await import("@/app/app/_actions/notifications");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const promises = selectedTrainees.map(async (traineeId: string) => {
      return createNotification({
        recipientUserId: traineeId,
        type: "course_updated",
        title: `Course Updated - Resit Required: ${courseTitle}`,
        body: `The course "${courseTitle}" has been updated and you need to complete it again. Please log in to start your resit.`,
        sendTeams: true,
        data: {
          courseTitle,
          courseId,
          senderName,
          senderId: user.id,
          url: `${siteUrl}/app/learn/courses/${courseId}`,
          event_id: `course_resit_${courseId}_${traineeId}_${Date.now()}`
        }
      });
    });

    await Promise.all(promises);

    return NextResponse.json({ 
      success: true, 
      message: `Notifications sent to ${selectedTrainees.length} trainee${selectedTrainees.length !== 1 ? 's' : ''}` 
    });

  } catch (error) {
    console.error("Error sending resit notifications:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}