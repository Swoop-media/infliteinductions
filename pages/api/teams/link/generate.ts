import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

function supabaseServer(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // substitute with your session logic; for now accept ?userId=...
  const userId = (req.query.userId as string) || "";
  if (!userId) return res.status(400).json({ error: "missing userId" });

  const code = String(randomInt(100000, 1000000)); // 6 digits
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const sb = supabaseServer(req, res);
  const { error } = await sb.from("teams_link_codes").insert({
    user_id: userId,
    code,
    expires_at: expiresAt,
  } as any);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ code, expiresAt, ttlMinutes: 15 });
}
