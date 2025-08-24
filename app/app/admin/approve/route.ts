import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  // Role check via RLS-safe helpers
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) return NextResponse.redirect(makeURL("/app/home"));

  const supabase = await createSupabaseServer();

  const form = await req.formData();
  const enrolment_id = String(form.get("enrolment_id") || "").trim();
  if (!enrolment_id) {
    const to = makeURL("/app/admin");
    to.searchParams.set("error", "Missing enrolment_id");
    return NextResponse.redirect(to);
  }

  // Update using the normal client; RLS allows this for Admin/Trainers
  const { error } = await supabase
    .from("course_enrolments")
    .update({ status: "approved" })
    .eq("id", enrolment_id);

  const to = makeURL("/app/admin");
  if (error) {
    to.searchParams.set("error", error.message);
  } else {
    to.searchParams.set("ok", "enrolment_approved");
  }
  return NextResponse.redirect(to);
}
