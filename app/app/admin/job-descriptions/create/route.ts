// @ts-nocheck
// app/app/admin/job-descriptions/create/route.ts
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
  const name = String(form.get("name") || "").trim();

  const back = await makeURL("/app/admin?tab=sites_jobs");

  if (!name) {
    back.searchParams.set("error", "Job description name is required.");
    return NextResponse.redirect(back);
  }

  const { error } = await supabase.from("job_descriptions").insert({ name });

  if (error) {
    back.searchParams.set(
      "error",
      error.code === "23505" ? `Job description "${name}" already exists.` : error.message
    );
  } else {
    back.searchParams.set("ok", "job_added");
  }

  return NextResponse.redirect(back);
}
