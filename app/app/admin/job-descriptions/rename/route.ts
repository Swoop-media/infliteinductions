// @ts-nocheck
// app/app/admin/job-descriptions/rename/route.ts
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
  const name = String(form.get("name") || "").trim();

  const back = await makeURL("/app/admin?tab=sites_jobs");

  if (!id) {
    back.searchParams.set("error", "Missing job description id.");
    return NextResponse.redirect(back);
  }
  if (!name) {
    back.searchParams.set("error", "Job description name is required.");
    return NextResponse.redirect(back);
  }

  // Fetch the existing name so we can keep already-assigned users in sync
  const { data: existing } = await supabase
    .from("job_descriptions")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("job_descriptions")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    back.searchParams.set(
      "error",
      error.code === "23505" ? `Job description "${name}" already exists.` : error.message
    );
    return NextResponse.redirect(back);
  }

  // Job descriptions are stored on profiles as free text, so update assigned users
  // to the new name to keep them consistent with the managed list.
  if (existing?.name && existing.name !== name) {
    await supabase
      .from("profiles")
      .update({ job_description: name })
      .eq("job_description", existing.name);
  }

  back.searchParams.set("ok", "job_renamed");
  return NextResponse.redirect(back);
}
