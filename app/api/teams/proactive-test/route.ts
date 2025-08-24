import { ConfigurationBotFrameworkAuthentication } from "botbuilder";

const botAuth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID!,
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD!,
  MicrosoftAppType: "SingleTenant",
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID!, // 👈 ADD THIS
});

const adapter = new CloudAdapter(botAuth);

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  let aadObjectId: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    aadObjectId = body?.aadObjectId;
  } catch {}

  const { data: rows, error } = aadObjectId
    ? await supabase
        .from("teams_conversations")
        .select("*")
        .eq("user_aad_id", aadObjectId)
        .order("updated_at", { ascending: false })
        .limit(1)
    : await supabase
        .from("teams_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);

  if (error || !rows?.length) {
    return new Response("No stored conversation reference found.", { status: 404 });
  }

  const ref = rows[0].conversation;
  await adapter.continueConversation(ref, async (context: TurnContext) => {
    await context.sendActivity("🔔 Test message from the web app. If you see this, DMs work! 🎉");
  });

  return new Response("Sent", { status: 200 });
}

export async function GET() {
  return new Response("Use POST to send a proactive test message.", { status: 200 });
}
