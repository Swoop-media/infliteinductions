// @ts-nocheck
// app/app/creator/authorisations/delete/route.ts
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
  // AuthZ: Admin, Course creators, or Senior management
  const allowed =
    (await hasRole("Admin")) ||
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management"));
  const back = await makeURL("/app/creator");
  back.searchParams.set("tab", "authorisations");

  if (!allowed) {
    back.searchParams.set("error", "Not allowed.");
    return NextResponse.redirect(back);
  }

  const supabase = await createSupabaseServer();
  const form = await req.formData();
  const id = String(form.get("id") || "").trim();

  if (!id) {
    back.searchParams.set("error", "Missing id.");
    return NextResponse.redirect(back);
  }

  // Delete dependent rows first (if FKs aren’t ON DELETE CASCADE)
  const { error: ec } = await supabase
    .from("authorisation_courses")
    .delete()
    .eq("authorisation_id", id);
  if (ec) {
    back.searchParams.set("error", ec.message);
    return NextResponse.redirect(back);
  }

  const { error: ea } = await supabase
    .from("authorisation_assignments")
    .delete()
    .eq("authorisation_id", id);
  if (ea) {
    back.searchParams.set("error", ea.message);
    return NextResponse.redirect(back);
  }

  // Delete parent
  const { error } = await supabase.from("authorisations").delete().eq("id", id);
  if (error) {
    back.searchParams.set("error", error.message);
    return NextResponse.redirect(back);
  }

  back.searchParams.set("ok", "authorisation_deleted");
  return NextResponse.redirect(back);
}
