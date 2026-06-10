// @ts-nocheck
// app/app/admin/connections/remove/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Use 303 so the browser follows the redirect with a GET (Post/Redirect/Get),
// otherwise the default 307 re-POSTs to the page route (which has no POST handler).
function seeOther(url: URL): NextResponse {
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return seeOther(await makeURL("/app/home"));

  const supabase = supabaseAdmin();
  const form = await req.formData();
  const connectionId = String(form.get("connection_id") || "").trim();
  const auth = String(form.get("auth") || "").trim();

  const back = await makeURL(`/app/admin/connections${auth ? `?auth=${auth}` : ""}`);

  if (!connectionId || !UUID_RE.test(connectionId)) {
    back.searchParams.set("error", "Missing connection id.");
    return seeOther(back);
  }

  const { error } = await supabase
    .from("authorisation_connections")
    .delete()
    .eq("id", connectionId);

  if (error) {
    back.searchParams.set("error", error.message);
  } else {
    back.searchParams.set("ok", "connection_removed");
  }

  return seeOther(back);
}
