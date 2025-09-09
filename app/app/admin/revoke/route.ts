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
  const enrolment_id = String(form.get("enrolment_id") || "").trim();

  const to = await makeURL("/app/admin?tab=enrolments");
  if (!enrolment_id) {
    to.searchParams.set("error", "Missing enrolment_id");
    return NextResponse.redirect(to);
  }

  // Mark as cancelled (or rejected) on course_enrolments
  const { data: row, error } = await supabase
    .from("course_enrolments")
    .update({ status: "cancelled" })
    .eq("id", enrolment_id)
    .select("id, user_id, course_id")
    .single();

  if (error || !row) {
    to.searchParams.set("error", error?.message || "Update failed");
    return NextResponse.redirect(to);
  }

  // Notify the learner that access was revoked
  try {
    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", row.course_id)
      .maybeSingle();

    await supabase.from("notifications").insert({
      recipient_id: row.user_id,
      type: "enrolment_revoked",
      payload: { course_id: row.course_id, course_title: course?.title ?? "" },
      read: false,
    });
  } catch (e) {
    console.error("notify learner (revoked) failed", e);
  }

  to.searchParams.set("ok", "enrolment_revoked");
  return NextResponse.redirect(to);
}