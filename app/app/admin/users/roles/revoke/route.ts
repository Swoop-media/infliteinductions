// app/app/admin/users/roles/revoke/route.ts
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
  const roleName = String(form.get("role") || "").trim();

  const to = await makeURL("/app/admin?tab=users");
  if (!user_id || !roleName) {
    to.searchParams.set("error", "Missing user_id or role");
    return NextResponse.redirect(to);
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    to.searchParams.set("error", "Not authenticated");
    return NextResponse.redirect(to);
  }

  // Self-lockout guard
  if (user.id === user_id && roleName.toLowerCase() === "admin") {
    to.searchParams.set("error", "You cannot remove your own Admin role.");
    return NextResponse.redirect(to);
  }

  // Resolve role id by name
  let { data: roleRow, error: rErr } = await supabase
    .from("roles")
    .select("id, name")
    .ilike("name", roleName)
    .maybeSingle();
  if (rErr || !roleRow) {
    to.searchParams.set("error", `Role not found: ${roleName}`);
    return NextResponse.redirect(to);
  }

  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", user_id)
    .eq("role_id", roleRow.id as string);

  if (error) {
    to.searchParams.set("error", error.message);
    return NextResponse.redirect(to);
  }

  to.searchParams.set("ok", "role_revoked");
  return NextResponse.redirect(to);
}
