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
  console.log("🔍 Looking up Teams link for app user:", appUserId);
  
  const { data, error } = await sb
    .from("teams_links")
    .select("conversation_ref, teams_user_id, aad_object_id, user_id")
    .eq("user_id", appUserId)
    .maybeSingle();

  console.log("📋 Teams link lookup result:", { 
    found: !!data, 
    error: error?.message, 
    hasConversationRef: !!data?.conversation_ref,
    teamsUserId: data?.teams_user_id,
    appUserId: data?.user_id
  });

  if (error) {
    console.error("❌ Database error looking up Teams link:", error);
    throw error;
  }

  const ref = data?.conversation_ref;
  if (!ref) {
    console.log("⚠️ No conversation reference found for user:", appUserId);
    console.log("💡 User needs to link their Teams account or send a message to the bot first");
    return false;
  }

  console.log("📤 Sending proactive message to Teams...");
  console.log("📝 Message preview:", text.substring(0, 100) + "...");
  
  try {
    await sendProactive(ref, text);
    console.log("✅ Teams message sent successfully to user:", appUserId);
    return true;
  } catch (error) {
    console.error("❌ Failed to send Teams message to user:", appUserId, error);
    throw error;
  }
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
