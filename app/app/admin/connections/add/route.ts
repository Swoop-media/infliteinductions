// @ts-nocheck
// app/app/admin/connections/add/route.ts
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
  const auth = String(form.get("auth") || "").trim();
  const target = String(form.get("target") || "").trim();

  const back = await makeURL(`/app/admin/connections${auth ? `?auth=${auth}` : ""}`);

  if (!auth || !target) {
    back.searchParams.set("error", "Both authorisations are required.");
    return seeOther(back);
  }

  if (!UUID_RE.test(auth) || !UUID_RE.test(target)) {
    back.searchParams.set("error", "Invalid authorisation selected.");
    return seeOther(back);
  }

  if (auth === target) {
    back.searchParams.set("error", "An authorisation cannot be connected to itself.");
    return seeOther(back);
  }

  const { error } = await supabase
    .from("authorisation_connections")
    .insert({ authorisation_id_a: auth, authorisation_id_b: target });

  if (error) {
    back.searchParams.set(
      "error",
      error.code === "23505" ? "These authorisations are already connected." : error.message
    );
  } else {
    back.searchParams.set("ok", "connection_added");
  }

  return seeOther(back);
}
