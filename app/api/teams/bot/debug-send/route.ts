export const runtime = "nodejs";
import { createSupabaseServer } from "@/lib/supabase/server";

async function getBotToken() {
  const tenant = process.env.MICROSOFT_BOT_TENANT_ID || "organizations";
  const params = new URLSearchParams();
  params.set("client_id", process.env.MICROSOFT_APP_ID || "");
  params.set("client_secret", process.env.MICROSOFT_APP_PASSWORD || "");
  params.set("grant_type", "client_credentials");
  params.set("scope", "https://api.botframework.com/.default");
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() }
  );
  const json = await resp.json();
  return json.access_token as string;
}

export async function POST(req: Request) {
  const { aad_id, text } = await req.json().catch(() => ({}));
  if (!aad_id || !text) return new Response("aad_id and text required", { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: row } = await supabase
    .from("teams_conversations")
    .select("*")
    .eq("user_aad_id", aad_id)
    .maybeSingle();

  if (!row?.service_url || !row?.conversation_id) {
    return new Response("No conversation found for user", { status: 404 });
  }

  const token = await getBotToken();
  const url = `${row.service_url.replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(row.conversation_id)}/activities`;
  const payload = { type: "message", text: String(text) };

  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return new Response(`sent: ${r.status}`, { status: 200 });
}
