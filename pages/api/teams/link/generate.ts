import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomInt } from "crypto";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  return createClient(url, key, {
    auth: { persistSession: false },
    // Hard cap on Supabase HTTP round-trips so connection blips can't hang
    // requests indefinitely and saturate the VM (Aug 2026 outages).
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
    },
  });
}

function getSessionClient(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return Object.entries(req.cookies).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.setHeader("Set-Cookie", `${name}=${value}`);
        });
      },
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).end();
  }

  const sessionClient = getSessionClient(req, res);
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const sb = supabaseAdmin();
  const { error } = await sb.from("teams_link_codes").insert({
    user_id: user.id,
    code,
    expires_at: expiresAt,
  } as any);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ code, expiresAt, ttlMinutes: 15 });
}
