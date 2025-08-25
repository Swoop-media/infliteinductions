import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(await makeURL("/"));

  const form = await req.formData();
  const course_id = String(form.get("course_id") || "").trim();

  const to = await makeURL("/app/courses");
  if (!course_id) {
    to.searchParams.set("error", "Missing course_id");
    return NextResponse.redirect(to);
  }

  const { error: insErr } = await supabase.from("course_enrolments").insert({
    user_id: user.id,
    course_id,
    status: "pending",
  });

  if (insErr) {
    if ((insErr as any).code === "23505") {
      to.searchParams.set("ok", "already_requested");
    } else {
      to.searchParams.set("error", insErr.message || "Unable to create enrolment");
    }
    return NextResponse.redirect(to);
  }

  // 🔒 Notify Admins/Trainers via direct notification (with proper Teams integration)
  try {
    const { notifyUser } = await import("@/lib/notifications/dispatcher");
    
    // Get course details for notification
    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", course_id)
      .maybeSingle();

    // Get user details
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get all admins and trainers to notify
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select(`
        user_id,
        roles!inner(name)
      `)
      .ilike("roles.name", "%admin%")
      .or("roles.name.ilike.%trainer%");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const enrollmentUrl = `${siteUrl}/app/admin?tab=enrolments`;

    console.log("Found admin users to notify:", adminUsers?.length || 0);

    // Notify each admin/trainer
    if (adminUsers) {
      for (const admin of adminUsers) {
        console.log(`Sending enrollment notification to admin: ${admin.user_id}`);
        await notifyUser(
          admin.user_id,
          "enrolment_request",
          {
            learnerName: userProfile?.full_name || userProfile?.email || "Unknown",
            learner_email: userProfile?.email,
            courseTitle: course?.title || "Unknown Course",
            url: enrollmentUrl,
            user_id: user.id,
            course_id: course_id,
          },
          {
            eventId: `enrol_req_${user.id}_${course_id}`,
            skipTeams: false,
          }
        );
      }
    }
  } catch (e) {
    console.error("Direct notification failed", e);
  }

  to.searchParams.set("ok", "enrolment_requested");
  return NextResponse.redirect(to);
}