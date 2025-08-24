
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  const isCreator = await hasRole("Course creators");
  const isManager = await hasRole("Senior management");
  
  if (!isAdmin && !isCreator && !isManager) {
    return NextResponse.redirect(makeURL("/app/home"));
  }

  const supabase = await createSupabaseServer();
  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const course_id = String(form.get("course_id") || "").trim();

  const to = makeURL("/app/admin?tab=users");
  if (!user_id || !course_id) {
    to.searchParams.set("error", "Missing user_id or course_id");
    return NextResponse.redirect(to);
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    to.searchParams.set("error", "Not authenticated");
    return NextResponse.redirect(to);
  }

  // Get course details
  const { data: course } = await supabase
    .from("courses")
    .select("id, title")
    .eq("id", course_id)
    .maybeSingle();

  if (!course) {
    to.searchParams.set("error", "Course not found");
    return NextResponse.redirect(to);
  }

  // Assign course (create enrolment)
  const { error } = await supabase
    .from("course_enrolments")
    .upsert(
      { 
        user_id, 
        course_id, 
        status: "approved", 
        enrolled_at: new Date().toISOString(),
        approved_by: user.id 
      },
      { onConflict: "user_id,course_id", ignoreDuplicates: true }
    );

  if (error) {
    to.searchParams.set("error", error.message);
    return NextResponse.redirect(to);
  }

  // Send notification to user about course assignment
  try {
    const { createNotification } = await import("@/app/app/_actions/notifications");
    
    // Get assigner name
    const { data: assigner } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    
    const assignerName = assigner ? `${assigner.first_name} ${assigner.last_name}`.trim() : "Admin";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    
    await createNotification({
      recipientUserId: user_id,
      type: "course_assigned",
      title: `Course Assigned: ${course.title}`,
      body: `You have been enrolled in "${course.title}" by ${assignerName}. You can start learning now!`,
      data: {
        courseTitle: course.title,
        courseId: course.id,
        assignedBy: assignerName,
        assignedById: user.id,
        url: `${siteUrl}/app/learn/courses/${course.id}`
      }
    });
  } catch (notifyError) {
    console.warn("Failed to send course assignment notification:", notifyError);
  }

  to.searchParams.set("ok", "course_assigned");
  return NextResponse.redirect(to);
}
