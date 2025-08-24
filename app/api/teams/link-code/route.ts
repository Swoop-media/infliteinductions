// app/api/teams/link-code/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

function makeCode(len = 6) {
  // 6 digits: easier to type on mobile
  const n = Math.floor(Math.random() * 10 ** len).toString().padStart(len, "0");
  return n;
}

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Try a few times in case of rare code collision
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let lastErr: any = null;

  for (let i = 0; i < 5; i++) {
    const code = makeCode(6);

    // Upsert by user_id so users can refresh their code; 'code' itself is unique, so
    // if it collides with someone else we'll just retry with a new code.
    const { data, error } = await supabase
      .from("user_link_codes")
      .upsert(
        { user_id: user.id, code, expires_at: expiresAt },
        { onConflict: "user_id" }
      )
      .select("code, expires_at")
      .single();

    if (!error && data) {
      return NextResponse.json({
        code: data.code,
        expiresAt: data.expires_at,
        ttlMinutes: 15,
      });
    }

    // Unique violation on 'code' → try again with a different code
    if ((error as any)?.code === "23505") {
      lastErr = error;
      continue;
    }

    // Other errors: break
    lastErr = error;
    break;
  }

  console.error("Failed to mint link code:", lastErr);
  return NextResponse.json({ error: "Unable to mint code" }, { status: 500 });
}
