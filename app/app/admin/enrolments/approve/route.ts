// app/app/admin/enrolments/approve/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notifications/dispatcher";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

// Determine which enrolments table your project has
async function detectEnrolmentTable(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { error } = await supabase.from("course_enrolments").select("id").limit(1);
  return error ? "enrolments" : "course_enrolments";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const to = makeURL("/app/admin?tab=enrolments");

  // Approver (must be signed in and permitted by your RLS)
  const {
    data: { user: approver },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !approver) {
    to.searchParams.set("error", "Not authenticated");
    return NextResponse.redirect(to);
  }

  const form = await req.formData();
  const enrolment_id = String(form.get("enrolment_id") || "").trim();
  if (!enrolment_id) {
    to.searchParams.set("error", "Missing enrolment_id");
    return NextResponse.redirect(to);
  }

  // Find enrolment row
  const table = await detectEnrolmentTable(supabase);
  const { data: enr, error: eErr } = await supabase
    .from(table)
    .select("id, user_id, course_id, status")
    .eq("id", enrolment_id)
    .maybeSingle();

  if (eErr || !enr) {
    to.searchParams.set("error", eErr?.message || "Enrolment not found");
    return NextResponse.redirect(to);
  }

  // Update status -> approved
  {
    const { error } = await supabase.from(table).update({ status: "approved" }).eq("id", enrolment_id);
    if (error) {
      to.searchParams.set("error", error.message);
      return NextResponse.redirect(to);
    }
  }

  // Ensure the learner is assigned to the course as a trainee (create if missing)
  {
    const insert = {
      user_id: enr.user_id,
      course_id: enr.course_id,
      role: "trainee",
      created_by: approver.id, // keep NOT NULL happy if present
    } as any;

    const { error: aErr } = await supabase
      .from("course_assignments")
      .upsert([insert], { onConflict: "course_id,user_id,role", ignoreDuplicates: true });

    // If your client doesn’t support ignoreDuplicates, allow 23505 silently
    if (aErr && (aErr as any).code !== "23505") {
      to.searchParams.set("error", aErr.message);
      return NextResponse.redirect(to);
    }
  }

  // Optional: nice payload details for the notification
  let courseTitle = "";
  try {
    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", enr.course_id)
      .maybeSingle();
    courseTitle = course?.title ?? "";
  } catch {
    // ignore
  }

  // Notify learner (idempotent via eventId = enrolment_id)
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const url = site ? `${site}/app/learn/courses/${enr.course_id}` : undefined;

    // NOTE: dispatcher signature is (recipientId, type, payload, opts?)
    await notifyUser(
      enr.user_id,
      "enrolment_approved",
      { course_title: courseTitle, url },
      { eventId: enrolment_id } // prevents duplicates if the action is retried
    );
  } catch {
    // Notification failures should not block approval flow
  }

  to.searchParams.set("ok", "enrolment_approved");
  return NextResponse.redirect(to);
}
