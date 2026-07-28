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
    // Create authorization assignments
    const assignments = authorization_ids.map(authorisation_id => ({
      user_id,
      authorisation_id,
      created_by: user.id,
      assignment_status: "assigned"
      // Note: No assigned_at column in authorisation_assignments table, using created_at instead
    }));

    const { error: assignError } = await supabase
      .from("authorisation_assignments")
      .upsert(assignments, {
        onConflict: 'user_id,authorisation_id',
        ignoreDuplicates: false
      });

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
        const courseAssignments = authCourses.map(ac => ({
          user_id,
          course_id: ac.course_id,
          created_by: user.id,
          role: "trainee",
          assignment_status: "assigned",
          assigned_at: new Date().toISOString()
        }));

        // Upsert course assignments
        await supabase
          .from("course_assignments")
          .upsert(courseAssignments, {
            onConflict: 'user_id,course_id,role',
            ignoreDuplicates: false
          });

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