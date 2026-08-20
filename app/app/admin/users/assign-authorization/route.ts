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
  const authorization_ids = form.getAll("authorization_ids").map(id => String(id));

  const back = await makeURL(`/app/admin/users/${user_id}`);

  if (!user_id) {
    back.searchParams.set("error", "User ID is required");
    return NextResponse.redirect(back);
  }

  if (authorization_ids.length === 0) {
    back.searchParams.set("error", "Please select at least one authorization to assign");
    return NextResponse.redirect(back);
  }

  try {
    // Guard: assigning an authorisation also assigns its required courses, and
    // learners must never be assigned to unpublished (draft/archived) courses —
    // draft-course content is hidden from learners and surfaces as broken quizzes.
    // Checked before any writes so rejection leaves nothing partially assigned.
    const { data: requiredCourseLinks, error: linkError } = await supabase
      .from("authorisation_courses")
      .select("course_id")
      .in("authorisation_id", authorization_ids);

    if (linkError) {
      console.error("Authorisation course lookup error:", linkError);
      back.searchParams.set("error", "Could not verify the courses required by the selected authorisations. Please try again.");
      return NextResponse.redirect(back);
    }

    const requiredCourseIds = Array.from(new Set((requiredCourseLinks || []).map(l => l.course_id)));
    if (requiredCourseIds.length > 0) {
      const { data: requiredCourses, error: statusError } = await supabase
        .from("courses")
        .select("id, title, status")
        .in("id", requiredCourseIds);

      if (statusError || !requiredCourses || requiredCourses.length !== requiredCourseIds.length) {
        console.error("Course status check error:", statusError);
        back.searchParams.set("error", "Could not verify the status of all courses required by the selected authorisations. Please try again.");
        return NextResponse.redirect(back);
      }

      const unpublished = requiredCourses.filter(c => c.status !== "published");
      if (unpublished.length > 0) {
        const names = unpublished.map(c => `"${c.title}" (${c.status})`).join(", ");
        back.searchParams.set(
          "error",
          `Cannot assign: the selected authorisation(s) require unpublished courses: ${names}. Learners cannot see draft or archived course content — publish the course(s) first, then assign the authorisation.`
        );
        return NextResponse.redirect(back);
      }
    }

    // Create only missing authorization assignments. Reassigning an existing
    // authorization must never reset a completed/approved historical record;
    // the explicit retake action is the only reset path.
    const { data: existingAuthorisations, error: existingAuthError } = await supabase
      .from("authorisation_assignments")
      .select("authorisation_id")
      .eq("user_id", user_id)
      .in("authorisation_id", authorization_ids);
    if (existingAuthError) {
      back.searchParams.set("error", `Failed to check existing authorizations: ${existingAuthError.message}`);
      return NextResponse.redirect(back);
    }
    const existingAuthIds = new Set((existingAuthorisations || []).map(a => a.authorisation_id));
    const assignments = authorization_ids
      .filter(authorisation_id => !existingAuthIds.has(authorisation_id))
      .map(authorisation_id => ({
      user_id,
      authorisation_id,
      created_by: user.id,
      assignment_status: "assigned"
      // Note: No assigned_at column in authorisation_assignments table, using created_at instead
    }));

    const { error: assignError } = assignments.length > 0
      ? await supabase.from("authorisation_assignments").insert(assignments)
      : { error: null };

    if (assignError) {
      console.error("Authorization assignment error:", assignError);
      back.searchParams.set("error", `Failed to assign authorizations: ${assignError.message}`);
      return NextResponse.redirect(back);
    }

    // For each authorization, also assign the required courses
    for (const authorisation_id of authorization_ids) {
      // Get courses required for this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", authorisation_id);

      if (authCourses && authCourses.length > 0) {
        const authCourseIds = authCourses.map(ac => ac.course_id);
        const { data: existingCourses, error: existingCoursesError } = await supabase
          .from("course_assignments")
          .select("course_id")
          .eq("user_id", user_id)
          .eq("role", "trainee")
          .in("course_id", authCourseIds);
        if (existingCoursesError) {
          throw new Error(`Could not check existing course assignments: ${existingCoursesError.message}`);
        }
        const existingCourseIds = new Set((existingCourses || []).map(c => c.course_id));
        const courseAssignments = authCourses
          .filter(ac => !existingCourseIds.has(ac.course_id))
          .map(ac => ({
          user_id,
          course_id: ac.course_id,
          created_by: user.id,
          role: "trainee",
          assignment_status: "assigned",
          assigned_at: new Date().toISOString()
        }));

        if (courseAssignments.length > 0) {
          const { error: courseAssignmentError } = await supabase
            .from("course_assignments")
            .insert(courseAssignments);
          if (courseAssignmentError) {
            throw new Error(`Could not create required course assignments: ${courseAssignmentError.message}`);
          }
        }

        // Create enrollments
        const enrollments = authCourses.map(ac => ({
          user_id,
          course_id: ac.course_id,
          status: "approved"
        }));

        await supabase
          .from("course_enrolments")
          .upsert(enrollments, {
            onConflict: 'user_id,course_id',
            ignoreDuplicates: false
          });
      }
    }

    // Create notifications for the user
    try {
      await supabase.from("notifications").insert(
        authorization_ids.map(authorisation_id => ({
          recipient_id: user_id,
          type: "authorization_assigned",
          payload: { authorisation_id, assigned_by: user.id },
          read: false
        }))
      );
    } catch {
      // Ignore notification errors
    }

    // Audit trail (best-effort)
    try {
      const { data: assignedAuths } = await supabase
        .from("authorisations")
        .select("title")
        .in("id", authorization_ids);
      await logUserAudit({
        userId: user_id,
        actorId: user.id,
        action: "authorisation_assigned",
        details: { authorisation_titles: (assignedAuths || []).map(a => a.title) },
      });
    } catch (auditErr) {
      console.error("Audit log failed for authorisation assignment:", auditErr);
    }

    back.searchParams.set("ok", "authorizations_assigned");
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Authorization assignment error:", error);
    back.searchParams.set("error", "Failed to assign authorizations");
    return NextResponse.redirect(back);
  }
}