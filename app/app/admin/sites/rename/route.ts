// @ts-nocheck
// app/app/admin/sites/rename/route.ts
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
    back.searchParams.set("error", "Missing site id.");
    return NextResponse.redirect(back);
  }
  if (!name) {
    back.searchParams.set("error", "Site name is required.");
    return NextResponse.redirect(back);
  }

  const { error } = await supabase
    .from("sites")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    back.searchParams.set(
      "error",
      error.code === "23505" ? `Site "${name}" already exists.` : error.message
    );
  } else {
    back.searchParams.set("ok", "site_renamed");
  }

  return NextResponse.redirect(back);
}
