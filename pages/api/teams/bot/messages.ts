// pages/api/teams/bot/messages.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
} from "botbuilder";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

// ---------- Credentials ----------
const MicrosoftAppId = process.env.MICROSOFT_APP_ID || "";
const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD || "";
const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID || "";
const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";

// CloudAdapter validates Bot Framework JWTs on every inbound request.
// The callback is only invoked after the token is cryptographically verified.
const botAuth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppType,
  MicrosoftAppTenantId,
});

const adapter = new CloudAdapter(botAuth);

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // adapter.process() validates the Bot Framework JWT before invoking the
  // callback. Forged or headerless requests are rejected automatically.
  await adapter.process(req as any, res as any, async (context: TurnContext) => {
    const activity = context.activity;

    // Store/refresh the conversation reference for proactive messaging.
    const storeConversationRef = async () => {
      try {
        const supabase = supabaseAdmin();
        const conversationRef = {
          user: activity.from,
          bot: activity.recipient,
          conversation: activity.conversation,
          channelId: activity.channelId,
          serviceUrl: activity.serviceUrl,
        };

        await supabase.from("teams_links").upsert(
          {
            teams_user_id: activity.from?.id,
            aad_object_id: activity.from?.aadObjectId,
            conversation_ref: conversationRef,
            last_activity: new Date().toISOString(),
          },
          { onConflict: "teams_user_id" }
        );

        console.log("Stored conversation reference for user:", activity.from?.aadObjectId);
      } catch (error) {
        console.error("Failed to store conversation reference:", error);
      }
    };

    if (activity?.type === "message") {
      await storeConversationRef();

      const txt = (activity.text || "").trim().toLowerCase();

      if (txt === "ping") {
        await context.sendActivity("pong");
      } else if (txt.startsWith("link ")) {
        const linkCode = txt.substring(5).trim();
        if (linkCode) {
          try {
            const supabase = supabaseAdmin();

            const { data: linkData } = await supabase
              .from("teams_link_codes")
              .select("user_id, expires_at, code")
              .ilike("code", linkCode)
              .maybeSingle();

            if (linkData && new Date(linkData.expires_at) > new Date()) {
              await supabase.from("teams_links").upsert(
                {
                  teams_user_id: activity.from?.id,
                  aad_object_id: activity.from?.aadObjectId,
                  user_id: linkData.user_id,
                  conversation_ref: {
                    user: activity.from,
                    bot: activity.recipient,
                    conversation: activity.conversation,
                    channelId: activity.channelId,
                    serviceUrl: activity.serviceUrl,
                  },
                  last_activity: new Date().toISOString(),
                },
                { onConflict: "teams_user_id" }
              );

              await supabase.from("teams_link_codes").delete().eq("code", linkCode);
              await context.sendActivity("✅ Successfully linked! You'll now receive notifications here.");
            } else {
              await context.sendActivity("❌ Invalid or expired link code. Please generate a new one from your profile.");
            }
          } catch (error) {
            console.error("Linking failed:", error);
            await context.sendActivity("❌ Linking failed. Please try again later.");
          }
        } else {
          await context.sendActivity("Please provide a link code: `link <your-code>`");
        }
      } else {
        await context.sendActivity(`echo: ${activity.text ?? ""}`);
      }
    } else if (activity?.type === "conversationUpdate") {
      await storeConversationRef();

      const added = activity.membersAdded || [];
      for (const m of added) {
        if (m.id !== activity.recipient?.id) {
          await context.sendActivity(
            "Hi! I'm online. Send me a link code to connect your account: `link <your-code>`"
          );
        }
      }
    }
  });
}
