// app/app/admin/users/roles/grant/route.ts
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

  // Resolve role id by name (roles: id, name)
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
    .upsert(
      { user_id, role_id: roleRow.id as string, granted_by: user.id },
      { onConflict: "user_id,role_id", ignoreDuplicates: true }
    );

  if (error) {
    to.searchParams.set("error", error.message);
    return NextResponse.redirect(to);
  }

  // Send notification to user about role being granted
  try {
    const { createNotification } = await import("@/app/app/_actions/notifications");
    
    // Get granter name
    const { data: granter } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    
    const granterName = granter ? `${granter.first_name} ${granter.last_name}`.trim() : "Admin";
    
    await createNotification({
      recipientUserId: user_id,
      type: "role_granted",
      title: `Role Granted: ${roleRow.name}`,
      body: `You have been granted the "${roleRow.name}" role by ${granterName}.`,
      data: {
        roleName: roleRow.name,
        roleId: roleRow.id,
        grantedBy: granterName,
        grantedById: user.id
      }
    });
  } catch (notifyError) {
    console.warn("Failed to send role granted notification:", notifyError);
  }

  to.searchParams.set("ok", "role_granted");
  return NextResponse.redirect(to);
}
