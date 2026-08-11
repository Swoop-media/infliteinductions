// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
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

  const supabaseAuth = await createSupabaseServer();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.redirect(await makeURL("/app/home"));

  const form = await req.formData();
  const assignment_id = String(form.get("assignment_id") || "").trim();
  const user_id = String(form.get("user_id") || "").trim();
  const course_id = String(form.get("course_id") || "").trim();

  const back = await makeURL("/app/admin/tools/unpublished-assignments");

  if (!assignment_id || !user_id || !course_id) {
    back.searchParams.set("error", "Missing assignment details");
    return NextResponse.redirect(back);
  }

  const supabase = createSupabaseService();

  // Fetch the assignment itself — never trust the submitted user/course values.
  const { data: assignment, error: fetchError } = await supabase
    .from("course_assignments")
    .select("id, user_id, course_id, role")
    .eq("id", assignment_id)
    .maybeSingle();

  if (fetchError || !assignment) {
    back.searchParams.set("error", "Assignment not found — it may already have been removed.");
    return NextResponse.redirect(back);
  }

  // Reject tampered/stale forms where the hidden fields don't match the real row
  if (
    assignment.role !== "trainee" ||
    assignment.user_id !== user_id ||
    assignment.course_id !== course_id
  ) {
    back.searchParams.set("error", "Assignment details did not match — refresh the page and try again.");
    return NextResponse.redirect(back);
  }

  // Safety: only remove assignments whose actual course is still unpublished
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, status")
    .eq("id", assignment.course_id)
    .maybeSingle();

  if (courseError || !course) {
    back.searchParams.set("error", "Could not verify the course for this assignment");
    return NextResponse.redirect(back);
  }
  if (course.status === "published") {
    back.searchParams.set(
      "error",
      `"${course.title}" is now published — the assignment is valid, so it was not removed.`
    );
    return NextResponse.redirect(back);
  }

  const { error: deleteError } = await supabase
    .from("course_assignments")
    .delete()
    .eq("id", assignment.id)
    .eq("user_id", assignment.user_id)
    .eq("course_id", assignment.course_id)
    .eq("role", "trainee");

  if (deleteError) {
    console.error("Failed to remove assignment:", deleteError);
    back.searchParams.set("error", `Failed to remove assignment: ${deleteError.message}`);
    return NextResponse.redirect(back);
  }

  // Remove the matching enrolment created alongside the assignment (best-effort),
  // using database-derived values rather than form input
  const { error: enrolError } = await supabase
    .from("course_enrolments")
    .delete()
    .eq("user_id", assignment.user_id)
    .eq("course_id", assignment.course_id);
  if (enrolError) {
    console.error("Failed to remove enrolment:", enrolError);
  }

  // Audit trail (best-effort)
  try {
    await logUserAudit({
      userId: user_id,
      actorId: user.id,
      action: "course_unassigned",
      details: {
        course_title: course.title,
        course_status: course.status,
        reason: "unpublished-course cleanup tool",
      },
    });
  } catch (auditErr) {
    console.error("Audit log failed for assignment removal:", auditErr);
  }

  back.searchParams.set("ok", "removed");
  return NextResponse.redirect(back);
}
