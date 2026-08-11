// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { logUserAudit } from "@/lib/audit";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(await makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(await makeURL("/app/home"));

  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const course_ids = form.getAll("course_ids").map(id => String(id));

  const back = await makeURL(`/app/admin/users/${user_id}`);

  if (!user_id) {
    back.searchParams.set("error", "User ID is required");
    return NextResponse.redirect(back);
  }

  if (course_ids.length === 0) {
    back.searchParams.set("error", "Please select at least one course to assign");
    return NextResponse.redirect(back);
  }

  try {
    // Guard: never assign learners to unpublished (draft/archived) courses.
    // Draft-course content is hidden from learners, so such assignments surface
    // as broken quizzes. The UI only lists published courses, but this protects
    // against stale pages or courses unpublished after page load.
    const { data: selectedCourses, error: statusError } = await supabase
      .from("courses")
      .select("id, title, status")
      .in("id", course_ids);

    if (statusError || !selectedCourses || selectedCourses.length !== course_ids.length) {
      console.error("Course status check error:", statusError);
      back.searchParams.set("error", "Could not verify the status of all selected courses. Please refresh and try again.");
      return NextResponse.redirect(back);
    }

    const unpublished = selectedCourses.filter(c => c.status !== "published");
    if (unpublished.length > 0) {
      const names = unpublished.map(c => `"${c.title}" (${c.status})`).join(", ");
      back.searchParams.set(
        "error",
        `Cannot assign unpublished courses: ${names}. Learners cannot see draft or archived course content — publish the course first, then assign it.`
      );
      return NextResponse.redirect(back);
    }

    // Create course assignments
    const assignments = course_ids.map(course_id => ({
      user_id,
      course_id,
      created_by: user.id,
      role: "trainee",
      assignment_status: "assigned",
      assigned_at: new Date().toISOString()
    }));

    const { error: assignError } = await supabase
      .from("course_assignments")
      .upsert(assignments, {
        onConflict: 'user_id,course_id,role',
        ignoreDuplicates: false
      });

    if (assignError) {
      console.error("Course assignment error:", assignError);
      back.searchParams.set("error", `Failed to assign courses: ${assignError.message}`);
      return NextResponse.redirect(back);
    }

    // Create course enrollments for each assignment
    const enrollments = course_ids.map(course_id => ({
      user_id,
      course_id,
      status: "approved"
    }));

    const { error: enrollError } = await supabase
      .from("course_enrolments")
      .upsert(enrollments, {
        onConflict: 'user_id,course_id',
        ignoreDuplicates: false
      });

    if (enrollError) {
      console.error("Course enrollment error:", enrollError);
      // Don't fail the whole operation for enrollment errors, just log them
    }

    // Create notifications for the user
    try {
      await supabase.from("notifications").insert(
        course_ids.map(course_id => ({
          recipient_id: user_id,
          type: "course_assigned",
          payload: { course_id, assigned_by: user.id },
          read: false
        }))
      );
    } catch {
      // Ignore notification errors
    }

    // Audit trail (best-effort)
    try {
      const { data: assignedCourses } = await supabase
        .from("courses")
        .select("title")
        .in("id", course_ids);
      await logUserAudit({
        userId: user_id,
        actorId: user.id,
        action: "course_assigned",
        details: { course_titles: (assignedCourses || []).map(c => c.title) },
      });
    } catch (auditErr) {
      console.error("Audit log failed for course assignment:", auditErr);
    }

    back.searchParams.set("ok", "courses_assigned");
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Course assignment error:", error);
    back.searchParams.set("error", "Failed to assign courses");
    return NextResponse.redirect(back);
  }
}