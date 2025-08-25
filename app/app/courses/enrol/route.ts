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

  // 🔒 Notify Admins/Trainers via direct notification (handled by DB trigger)
  // The database trigger on_enrolment_insert_notify() automatically notifies admins
  console.log("Enrollment created - notifications handled by DB trigger");
  console.log("Enrollment details:", {
    user_id: user.id,
    course_id,
    status: "pending"
  });

  to.searchParams.set("ok", "enrolment_requested");
  return NextResponse.redirect(to);
}