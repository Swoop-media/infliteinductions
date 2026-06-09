// @ts-nocheck
// app/app/admin/job-descriptions/toggle/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

  const supabase = supabaseAdmin();
  const form = await req.formData();
  const id = String(form.get("id") || "").trim();
  const active = String(form.get("active") || "") === "true";

  const back = await makeURL("/app/admin?tab=sites_jobs");

  if (!id) {
    back.searchParams.set("error", "Missing job description id.");
    return NextResponse.redirect(back);
  }

  const { error } = await supabase
    .from("job_descriptions")
    .update({ active: !active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    back.searchParams.set("error", error.message);
  } else {
    back.searchParams.set("ok", active ? "job_deactivated" : "job_activated");
  }

  return NextResponse.redirect(back);
}
