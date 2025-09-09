// app/app/admin/users/update/route.ts
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
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(await makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  const form = await req.formData();

  const user_id = String(form.get("user_id") || "").trim();
  const full_name = String(form.get("full_name") || "").trim();
  const department = String(form.get("department") || "");
  const job_description = String(form.get("job_description") || "");

  const back = await makeURL(`/app/admin/users/${user_id}`);
  if (!user_id) {
    back.searchParams.set("error", "Missing user_id");
    return NextResponse.redirect(back);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, department: department || null, job_description: job_description || null })
    .eq("id", user_id);

  if (error) back.searchParams.set("error", error.message);
  else back.searchParams.set("ok", "profile_saved");

  return NextResponse.redirect(back);
}