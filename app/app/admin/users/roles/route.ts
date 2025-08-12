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
  // Only Admins can change roles
  const isAdmin = await hasRole("Admin");
  const to = makeURL("/app/admin/users");
  if (!isAdmin) {
    to.searchParams.set("error", "Not authorised");
    return NextResponse.redirect(to);
  }

  const supabase = createSupabaseServer();

  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const role_name = String(form.get("role_name") || "").trim();
  const action = String(form.get("action") || "").trim(); // grant|revoke

  if (!user_id || !role_name || !action) {
    to.searchParams.set("error", "Missing fields");
    return NextResponse.redirect(to);
  }

  // lookup role id by name
  const { data: role, error: roleErr } = await supabase
    .from("roles")
    .select("id, name")
    .eq("name", role_name)
    .maybeSingle();

  if (roleErr || !role) {
    to.searchParams.set("error", roleErr?.message || "Role not found");
    return NextResponse.redirect(to);
  }

  if (action === "grant") {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id, role_id: role.id });
    if (error) to.searchParams.set("error", error.message);
    else to.searchParams.set("ok", "granted");
  } else if (action === "revoke") {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", user_id)
      .eq("role_id", role.id);
    if (error) to.searchParams.set("error", error.message);
    else to.searchParams.set("ok", "revoked");
  } else {
    to.searchParams.set("error", "Invalid action");
  }

  return NextResponse.redirect(to);
}
