
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
    // First check if user exists and isn't already archived
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, archived_at")
      .eq("id", user_id)
      .maybeSingle();

    if (!profile) {
      back.searchParams.set("error", "User not found");
      return NextResponse.redirect(back);
    }

    if (profile.archived_at) {
      back.searchParams.set("error", "User is already archived");
      return NextResponse.redirect(back);
    }

    // Archive the user by setting archived_at timestamp
    const { error: archiveError } = await supabase
      .from("profiles")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", user_id);

    if (archiveError) {
      console.error("Archive error:", archiveError);
      back.searchParams.set("error", `Failed to archive user: ${archiveError.message}`);
      return NextResponse.redirect(back);
    }

    back.searchParams.set("ok", `User ${profile.full_name || profile.email} archived successfully`);
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Archive user error:", error);
    back.searchParams.set("error", "Failed to archive user");
    return NextResponse.redirect(back);
  }
}
