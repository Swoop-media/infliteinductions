
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  const supabaseService = supabaseAdmin();
  const form = await req.formData();

  const user_id = String(form.get("user_id") || "").trim();

  const back = makeURL("/app/admin?tab=users");
  if (!user_id) {
    back.searchParams.set("error", "Missing user_id");
    return NextResponse.redirect(back);
  }

  try {
    // Get user info for confirmation
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user_id)
      .maybeSingle();

    if (!profile) {
      back.searchParams.set("error", "User not found");
      return NextResponse.redirect(back);
    }

    // Delete user from auth (this will cascade to profile due to foreign key)
    const { error: authDeleteError } = await supabaseService.auth.admin.deleteUser(user_id);

    if (authDeleteError) {
      console.error("Auth delete error:", authDeleteError);
      back.searchParams.set("error", `Failed to delete user: ${authDeleteError.message}`);
      return NextResponse.redirect(back);
    }

    // Delete related data that might not cascade automatically
    await Promise.all([
      // Delete user roles
      supabase.from("user_roles").delete().eq("user_id", user_id),
      // Delete course assignments
      supabase.from("course_assignments").delete().eq("user_id", user_id),
      // Delete authorization assignments
      supabase.from("authorisation_assignments").delete().eq("user_id", user_id),
      // Delete teams links
      supabase.from("teams_links").delete().eq("user_id", user_id),
      // Delete teams link codes
      supabase.from("teams_link_codes").delete().eq("user_id", user_id),
      // Delete notifications
      supabase.from("notifications").delete().eq("user_id", user_id),
    ]);

    back.searchParams.set("ok", `User ${profile.full_name || profile.email} deleted successfully`);
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Delete user error:", error);
    back.searchParams.set("error", "Failed to delete user");
    return NextResponse.redirect(back);
  }
}
