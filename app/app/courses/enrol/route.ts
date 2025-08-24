import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";

async function makeURL(path: string): Promise<URL> {
  const h = headers();
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

  // 🔒 Notify Admins/Trainers via SECURITY DEFINER RPC (bypasses RLS)
  try {
    await supabase.rpc("notify_enrolment_request", {
      p_user_id: user.id,
      p_course_id: course_id,
    });
  } catch (e) {
    // soft-fail
    console.error("notify_enrolment_request rpc failed", e);
  }

  to.searchParams.set("ok", "enrolment_requested");
  return NextResponse.redirect(to);
}