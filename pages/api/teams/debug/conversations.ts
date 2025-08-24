
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const supabase = supabaseAdmin();

  // Check if teams_links table exists and has data
  const { data: links, error: linksError } = await supabase
    .from("teams_links")
    .select("*")
    .limit(5);

  // Also check teams_conversations if it exists
  const { data: conversations, error: conversationsError } = await supabase
    .from("teams_conversations")
    .select("*")
    .limit(5);

  res.status(200).json({
    teams_links: {
      data: links || [],
      error: linksError?.message || null,
      count: links?.length || 0
    },
    teams_conversations: {
      data: conversations || [],
      error: conversationsError?.message || null,
      count: conversations?.length || 0
    }
  });
}
