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

  // Accept one or many targets (multi-select tick list). Falls back to the legacy
  // single "target" field.
  const targets = Array.from(
    new Set(
      form
        .getAll("target")
        .map((t) => String(t || "").trim())
        .filter(Boolean)
    )
  );

  const back = await makeURL(`/app/admin/connections${auth ? `?auth=${auth}` : ""}`);

  if (!auth || targets.length === 0) {
    back.searchParams.set("error", "Select at least one authorisation to connect.");
    return seeOther(back);
  }

  if (!UUID_RE.test(auth) || targets.some((t) => !UUID_RE.test(t))) {
    back.searchParams.set("error", "Invalid authorisation selected.");
    return seeOther(back);
  }

  if (targets.some((t) => t === auth)) {
    back.searchParams.set("error", "An authorisation cannot be connected to itself.");
    return seeOther(back);
  }

  // Skip targets already connected in this direction so re-ticking an existing one
  // is a no-op instead of an error.
  const { data: existing } = await supabase
    .from("authorisation_connections")
    .select("authorisation_id_b")
    .eq("authorisation_id_a", auth);
  const already = new Set((existing || []).map((r) => r.authorisation_id_b));

  const toAdd = targets.filter((t) => !already.has(t));

  if (toAdd.length === 0) {
    back.searchParams.set("ok", "connection_added");
    return seeOther(back);
  }

  // Insert per-row so a single reverse-pair conflict (blocked by the legacy
  // order-independent unique index pre-migration-005) doesn't abort the rest.
  let added = 0;
  let blocked = 0;
  let otherError: string | null = null;

  for (const t of toAdd) {
    const { error } = await supabase
      .from("authorisation_connections")
      .insert({ authorisation_id_a: auth, authorisation_id_b: t });
    if (!error) {
      added += 1;
    } else if (error.code === "23505") {
      blocked += 1;
    } else {
      otherError = error.message;
    }
  }

  if (otherError) {
    back.searchParams.set("error", otherError);
  } else if (blocked > 0) {
    const addedMsg = added > 0 ? `${added} added. ` : "";
    back.searchParams.set(
      "error",
      `${addedMsg}${blocked} blocked because they already exist in the reverse direction. Apply migration 005 to allow two-way connections.`
    );
  } else {
    back.searchParams.set("ok", "connection_added");
  }

  return seeOther(back);
}
