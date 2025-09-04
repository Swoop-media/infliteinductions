
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
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  const form = await req.formData();

  const user_id = String(form.get("user_id") || "").trim();

  const back = makeURL("/app/admin/users/archived");
  if (!user_id) {
    back.searchParams.set("error", "Missing user_id");
    return NextResponse.redirect(back);
  }

  try {
    // Restore the user by setting archived_at to null
    const { error: restoreError } = await supabase
      .from("profiles")
      .update({ archived_at: null })
      .eq("id", user_id);

    if (restoreError) {
      console.error("Restore error:", restoreError);
      back.searchParams.set("error", `Failed to restore user: ${restoreError.message}`);
      return NextResponse.redirect(back);
    }

    back.searchParams.set("ok", "User restored successfully");
    return NextResponse.redirect(back);

  } catch (error) {
    console.error("Restore user error:", error);
    back.searchParams.set("error", "Failed to restore user");
    return NextResponse.redirect(back);
  }
}
