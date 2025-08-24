// app/app/creator/authorisations/new/route.ts
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

export async function GET() {
  // Only creators/managers/admins
  const allowed =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!allowed) return NextResponse.redirect(makeURL("/app/home"));

  const supabase = await createSupabaseServer();

  // Must be signed in
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(makeURL("/auth/login"));

  // Create draft authorisation
  const payload: Record<string, any> = {
    title: "New Authorisation",
    status: "draft",
    // If your table has NOT NULL created_by, uncomment:
    // created_by: user.id,
  };

  const { data, error } = await supabase
    .from("authorisations")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    const to = makeURL("/app/creator?tab=authorisations");
    to.searchParams.set("error", error?.message ?? "Failed to create authorisation");
    return NextResponse.redirect(to);
  }

  // Jump straight into the editor
  const to = makeURL(`/app/creator/authorisations/${data.id}?tab=details&notice=saved`);
  return NextResponse.redirect(to);
}
