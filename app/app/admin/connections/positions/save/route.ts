// @ts-nocheck
// app/app/admin/connections/positions/save/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Reset: clear all saved positions and fall back to the automatic layout.
  if (body?.reset) {
    const { error } = await supabase
      .from("authorisation_map_positions")
      .delete()
      .not("authorisation_id", "is", null);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const positions = Array.isArray(body?.positions) ? body.positions : [];
  const rows = positions
    .filter(
      (p: any) =>
        p &&
        typeof p.id === "string" &&
        UUID_RE.test(p.id) &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y)
    )
    .map((p: any) => ({
      authorisation_id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid positions to save." }, { status: 400 });
  }

  const { error } = await supabase
    .from("authorisation_map_positions")
    .upsert(rows, { onConflict: "authorisation_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
