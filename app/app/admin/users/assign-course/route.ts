// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

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
      enrolled_at: new Date().toISOString(),
      status: "enrolled"
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

    back.searchParams.set("ok", "courses_assigned");
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Course assignment error:", error);
    back.searchParams.set("error", "Failed to assign courses");
    return NextResponse.redirect(back);
  }
}