import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { headers } from "next/headers";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();

  // Ensure user is signed in
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(makeURL("/"));
  }

  // Read form data
  const form = await req.formData();
  const course_id = String(form.get("course_id") || "").trim();

  if (!course_id) {
    const to = makeURL("/app/courses");
    to.searchParams.set("error", "Missing course_id");
    return NextResponse.redirect(to);
  }

  // Attempt to create a pending enrolment
  const { error } = await supabase.from("course_enrolments").insert({
    user_id: user.id,
    course_id,
    status: "pending",
  });

  const to = makeURL("/app/courses");

  if (error) {
    // Handle unique violation (already enrolled/requested)
    if ((error as any).code === "23505") {
      to.searchParams.set("ok", "already_requested");
    } else {
      to.searchParams.set("error", error.message || "Unable to create enrolment");
    }
    return NextResponse.redirect(to);
  }

  // Success: DB triggers will notify Trainers/Admins
  to.searchParams.set("ok", "enrolment_requested");
  return NextResponse.redirect(to);
}
