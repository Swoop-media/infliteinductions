// @ts-nocheck
// @ts-nocheck
// app/app/admin/users/update/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { syncUserToSafeflite } from "@/lib/webhooks/safeflite-sync";

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
  const site_id = String(form.get("site_id") || "");
  const job_description = String(form.get("job_description") || "");

  const back = await makeURL(`/app/admin/users/${user_id}`);
  if (!user_id) {
    back.searchParams.set("error", "Missing user_id");
    return NextResponse.redirect(back);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, site_id: site_id || null, job_description: job_description || null })
    .eq("id", user_id);

  if (error) {
    back.searchParams.set("error", error.message);
  } else {
    back.searchParams.set("ok", "profile_saved");

    // Fetch updated profile to sync to SafeFLITE
    const { data: profile } = await supabase
      .from("profiles")
      .select("microsoft_id, email, full_name, job_description, department, created_at, updated_at, archived_at")
      .eq("id", user_id)
      .single();

    if (profile) {
      await syncUserToSafeflite({
        microsoft_id: profile.microsoft_id,
        email: profile.email,
        full_name: profile.full_name,
        job_description: profile.job_description,
        department: profile.department,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        archived_at: profile.archived_at
      });
    }
  }

  return NextResponse.redirect(back);
}