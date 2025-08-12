import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { notifyUser } from "@/lib/notify";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  const backTo = makeURL("/app/admin/users");
  if (!isAdmin) {
    backTo.searchParams.set("error", "Not authorised");
    return NextResponse.redirect(backTo);
  }

  const supabase = createSupabaseServer();
  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const full_name = String(form.get("full_name") || "").trim();
  const department = String(form.get("department") || "").trim();
  const job_description = String(form.get("job_description") || "").trim();

  if (!user_id) {
    backTo.searchParams.set("error", "Missing user_id");
    return NextResponse.redirect(backTo);
  }

  const { data: before } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user_id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: full_name || null,
      department: department || null,
      job_description: job_description || null,
    })
    .eq("id", user_id);

  const to = makeURL(`/app/admin/users/${user_id}`);
  if (error) {
    to.searchParams.set("error", error.message);
  } else {
    to.searchParams.set("ok", "1");

    await notifyUser({
      recipientId: user_id,
      recipientEmail: before?.email ?? null,
      type: "profile_updated",
      payload: {
        full_name: full_name || null,
        department: department || null,
        job_description: job_description || null,
      },
    });
  }
  return NextResponse.redirect(to);
}
