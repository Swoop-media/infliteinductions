// @ts-nocheck
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
  // Role check via RLS-safe helpers
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) return NextResponse.redirect(await makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  
  // Get the current user's ID for approved_by field
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  const form = await req.formData();
  const enrolment_id = String(form.get("enrolment_id") || "").trim();
  if (!enrolment_id) {
    const to = await makeURL("/app/admin");
    to.searchParams.set("error", "Missing enrolment_id");
    return NextResponse.redirect(to);
  }

  // Guard: approving an enrolment assigns the learner to the course, and learners
  // must never be assigned to unpublished (draft/archived) courses — the content
  // is hidden from them and surfaces as broken quizzes.
  {
    const { data: enrolmentToApprove } = await supabase
      .from("course_enrolments")
      .select("course_id")
      .eq("id", enrolment_id)
      .maybeSingle();
    if (!enrolmentToApprove) {
      const to = await makeURL("/app/admin");
      to.searchParams.set("error", "Enrolment not found");
      return NextResponse.redirect(to);
    }
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select("id, title, status")
      .eq("id", enrolmentToApprove.course_id)
      .maybeSingle();
    if (courseErr || !course) {
      const to = await makeURL("/app/admin");
      to.searchParams.set("error", "Could not verify course status for this enrolment");
      return NextResponse.redirect(to);
    }
    if (course.status !== "published") {
      const to = await makeURL("/app/admin");
      to.searchParams.set(
        "error",
        `Cannot approve: course "${course.title}" is ${course.status}. Learners cannot see unpublished course content — publish the course first.`
      );
      return NextResponse.redirect(to);
    }
  }

  // Update using the normal client; RLS allows this for Admin/Trainers
  const updateData: any = { 
    status: "approved",
    approved_at: new Date().toISOString(),
    approved_by: currentUserId // Set the approver's ID
  };
  const { error } = await supabase
    .from("course_enrolments")
    .update(updateData)
    .eq("id", enrolment_id);

  // Get enrolment details for course assignment
  if (!error) {
    const { data: enrolment } = await supabase
      .from("course_enrolments")
      .select("user_id, course_id")
      .eq("id", enrolment_id)
      .single();

    if (enrolment) {
      // Ensure course assignment exists
      const { error: assignmentError } = await supabase
        .from("course_assignments")
        .upsert(
          {
            user_id: enrolment.user_id,
            course_id: enrolment.course_id,
            role: "trainee",
            created_by: currentUserId // Add the approver as the creator
          },
          { onConflict: "course_id,user_id,role", ignoreDuplicates: true }
        );

      if (assignmentError && (assignmentError as any).code !== "23505") {
        console.warn("Course assignment creation warning:", assignmentError);
      }
    }
  }

  const to = await makeURL("/app/admin");
  if (error) {
    to.searchParams.set("error", error.message);
  } else {
    to.searchParams.set("ok", "enrolment_approved");
  }
  return NextResponse.redirect(to);
}
