// lib/teams/send.ts
import { createClient } from "@supabase/supabase-js";
import { sendProactive } from "./proactive";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase admin env not set (SUPABASE_URL + SERVICE_ROLE_KEY).");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Send a DM using your stored conversation_ref keyed by app user id (recipient_id). */
export async function sendTeamsDMToAppUser(appUserId: string, text: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("teams_links")
    .select("conversation_ref")
    .eq("user_id", appUserId)
    .maybeSingle();

  const ref = data?.conversation_ref;
  if (!ref) return false;

  await sendProactive(ref, text);
  return true;
}

/** Optional: if you ever store AAD object IDs in teams_links */
export async function sendTeamsDMToAadUser(aadObjectId: string, text: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("teams_links")
    .select("conversation_ref")
    .eq("aad_object_id", aadObjectId)
    .maybeSingle();

  const ref = data?.conversation_ref;
  if (!ref) return false;

  await sendProactive(ref, text);
  return true;
}
