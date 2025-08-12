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
  // Guard: only Admins can change roles
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
  const action = String(form.get("action") || "").trim(); // "grant" | "revoke"

  if (!user_id || !role_name || !action) {
    to.searchParams.set("error", "Missing fields");
    return NextResponse.redirect(to);
  }

  // Lookup role id by name
  const { data: role, error: roleErr } = await supabase
    .from("roles")
    .select("id, name")
    .eq("name", role_name)
    .maybeSingle();

  if (roleErr || !role) {
    to.searchParams.set("error", roleErr?.message || "Role not found");
    return NextResponse.redirect(to);
  }

  // We also want the recipient's email (not required for in-app)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", user_id)
    .maybeSingle();

  // Perform grant/revoke
  if (action === "grant") {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id, role_id: role.id });

    if (error) {
      to.searchParams.set("error", error.message);
      return NextResponse.redirect(to);
    }

    // In-app notification (direct insert, RLS allows Admin)
    await supabase.from("notifications").insert({
      recipient_id: user_id,
      type: "role_granted",
      payload: { role_name: role.name },
      read: false,
    });

    to.searchParams.set("ok", "granted");
    return NextResponse.redirect(to);
  }

  if (action === "revoke") {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", user_id)
      .eq("role_id", role.id);

    if (error) {
      to.searchParams.set("error", error.message);
      return NextResponse.redirect(to);
    }

    // In-app notification (direct insert)
    await supabase.from("notifications").insert({
      recipient_id: user_id,
      type: "role_revoked",
      payload: { role_name: role.name },
      read: false,
    });

    to.searchParams.set("ok", "revoked");
    return NextResponse.redirect(to);
  }

  to.searchParams.set("error", "Invalid action");
  return NextResponse.redirect(to);
}
