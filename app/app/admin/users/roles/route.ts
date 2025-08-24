// app/app/admin/users/roles/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  // Authn
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // Authz: only Admins can change roles
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) {
    const back = headers().get("referer") || "/app/home";
    return NextResponse.redirect(new URL(`${back}?error=forbidden`, req.url));
  }

  const form = await req.formData();
  const user_id = String(form.get("user_id") || "");
  const role_name = String(form.get("role_name") || "");
  const action = String(form.get("action") || "");

  if (!user_id || !role_name || !action) {
    const back = headers().get("referer") || "/app/admin/users";
    return NextResponse.redirect(new URL(`${back}?error=missing+fields`, req.url));
  }

  // Call the DB helpers (created earlier)
  // grant: public.app_grant_role(p_user uuid, p_role text, p_granted_by uuid)
  // revoke: public.app_revoke_role(p_user uuid, p_role text)
  let rpcErr: string | null = null;

  if (action === "grant") {
    const { error } = await supabase.rpc("app_grant_role", {
      p_user: user_id,
      p_role: role_name,
      p_granted_by: user.id,
    });
    rpcErr = error?.message ?? null;
  } else if (action === "revoke") {
    const { error } = await supabase.rpc("app_revoke_role", {
      p_user: user_id,
      p_role: role_name,
    });
    rpcErr = error?.message ?? null;
  } else {
    rpcErr = "unknown action";
  }

  // Optional: in-app notification to the target user
  // (only if you have a notifications table with notif_type including role_granted/role_revoked)
  try {
    if (!rpcErr) {
      const type = action === "grant" ? "role_granted" : "role_revoked";
      await supabase.from("notifications").insert({
        recipient_id: user_id,
        type,
        payload: { role: role_name, granted_by: user.id },
        read: false,
      });
    }
  } catch {
    // ignore notification errors
  }

  const back = headers().get("referer") || "/app/admin/users";
  const dest = new URL(back, req.url);
  if (rpcErr) dest.searchParams.set("error", rpcErr);
  else dest.searchParams.set("ok", "1");

  return NextResponse.redirect(dest);
}
