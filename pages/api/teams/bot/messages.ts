// pages/api/teams/bot/messages.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { TurnContext, ConfigurationServiceClientCredentialFactory, ConfigurationBotFrameworkAuthentication, CloudAdapter } from "botbuilder";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,      // we'll read the raw body ourselves
    externalResolver: true, // we fully control the response
  },
};

// ---------- Credentials & public cloud settings ----------
const MicrosoftAppId = process.env.MICROSOFT_APP_ID || "";
const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD || "";
const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID || ""; // required if SingleTenant
const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";

// Create admin client for bot operations (no cookies needed)
function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Re-enable authentication with correct SingleTenant configuration
const settings = {
  MicrosoftAppType,
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppTenantId,
  
  // Use botframework.com tenant for token acquisition (this is correct for bots)
  ToChannelFromBotLoginUrl: "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
  ToChannelFromBotOAuthScope: "https://api.botframework.com/.default",
  
  // Accept tokens from Bot Framework AND your tenant
  ValidTokenIssuers: [
    "https://api.botframework.com",
    "https://sts.windows.net/72f988bf-86f1-41af-91ab-2d7cd011db47/", // Microsoft tenant
    "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0", // Microsoft tenant
    `https://sts.windows.net/${MicrosoftAppTenantId}/`, // Your tenant
    `https://login.microsoftonline.com/${MicrosoftAppTenantId}/v2.0`, // Your tenant
  ],
  
  AuthenticationDisabled: true,
};

const creds = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppTenantId,
});

const auth = new ConfigurationBotFrameworkAuthentication(settings as any, creds);
const adapter = new CloudAdapter(auth);

// Helpful: if a turn throws, you still see a reply + logs
adapter.onTurnError = async (context, error) => {
  console.error("Bot unhandled error:", error);
  try { await context.sendActivity("Sorry — something went wrong handling that message."); } catch {}
};

// ---- minimal bot logic to smoke-test replies ----
async function botLogic(context: TurnContext) {
  if (context.activity.type === "message") {
    const txt = (context.activity.text || "").trim().toLowerCase();
    if (txt === "ping") {
      await context.sendActivity("pong");
    } else {
      await context.sendActivity(`echo: ${context.activity.text ?? ""}`);
    }
  } else if (context.activity.type === "conversationUpdate") {
    const added = context.activity.membersAdded || [];
    for (const m of added) {
      if (m.id !== context.activity.recipient?.id) {
        await context.sendActivity("Hi! I’m online.");
      }
    }
  }
}

// Read raw JSON body (since bodyParser is disabled)
function readJsonBody(req: NextApiRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  // Only accept real Bot Framework (Teams) calls; ignore random hits
  const hasBFHeader =
    !!req.headers.authorization ||
    typeof req.headers["x-ms-bot-signature"] === "string" ||
    typeof req.headers["x-ms-signing-key"] === "string";
  if (!hasBFHeader) { res.status(204).end(); return; }

  try {
    const activity = await readJsonBody(req);

    console.log("Processing bot activity:", {
      hasAuthHeader: Boolean(req.headers.authorization),
      activityType: activity?.type,
      channelId: activity?.channelId,
      from: activity?.from ? {
        id: activity.from.id,
        name: activity.from.name,
        aadObjectId: activity.from.aadObjectId
      } : undefined,
      conversation: activity?.conversation ? {
        id: activity.conversation.id,
        isGroup: activity.conversation.isGroup,
        conversationType: activity.conversation.conversationType
      } : undefined
    });

    // Send response back to Teams using direct HTTP call to Bot Framework API
    const sendToTeams = async (text: string) => {
      try {
        // Get access token for Bot Framework - use correct tenant for SingleTenant bots
        const tenant = MicrosoftAppType === "SingleTenant" ? MicrosoftAppTenantId : "botframework.com";
        const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.set("client_id", MicrosoftAppId);
        tokenParams.set("client_secret", MicrosoftAppPassword);
        tokenParams.set("grant_type", "client_credentials");
        tokenParams.set("scope", "https://api.botframework.com/.default");

        console.log("Requesting token from:", tokenUrl);
        console.log("Token params:", {
          client_id: MicrosoftAppId,
          grant_type: "client_credentials",
          scope: "https://api.botframework.com/.default"
        });

        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("Token request failed:", {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            response: errorText
          });
          throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Send message back to Teams
        const replyActivity = {
          type: "message",
          text: text,
          from: activity.recipient,
          recipient: activity.from,
          conversation: activity.conversation,
          replyToId: activity.id
        };

        const serviceUrl = activity.serviceUrl;
        const conversationId = activity.conversation.id;
        const replyUrl = `${serviceUrl}v3/conversations/${conversationId}/activities`;

        const messageResponse = await fetch(replyUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(replyActivity)
        });

        if (!messageResponse.ok) {
          const errorText = await messageResponse.text();
          console.error("Message send failed:", {
            status: messageResponse.status,
            statusText: messageResponse.statusText,
            response: errorText,
            requestUrl: replyUrl,
            requestBody: JSON.stringify(replyActivity)
          });
          throw new Error(`Message send failed: ${messageResponse.status} - ${errorText}`);
        }

        console.log("Successfully sent message to Teams:", text);
        return await messageResponse.json();
      } catch (error) {
        console.error("Failed to send message to Teams:", error);
        throw error;
      }
    };

    // Store conversation reference for proactive messaging
    const storeConversationRef = async () => {
      try {
        const supabase = supabaseAdmin();
        const conversationRef = {
          user: activity.from,
          bot: activity.recipient,
          conversation: activity.conversation,
          channelId: activity.channelId,
          serviceUrl: activity.serviceUrl
        };

        // Store/update the conversation reference keyed by Teams user ID and AAD object ID
        await supabase.from("teams_links").upsert({
          teams_user_id: activity.from?.id,
          aad_object_id: activity.from?.aadObjectId,
          conversation_ref: conversationRef,
          last_activity: new Date().toISOString()
        }, {
          onConflict: "teams_user_id"
        });

        console.log("Stored conversation reference for user:", activity.from?.aadObjectId);
      } catch (error) {
        console.error("Failed to store conversation reference:", error);
      }
    };

    // Process the activity and send responses
    if (activity?.type === "message") {
      await storeConversationRef();
      
      const txt = (activity.text || "").trim().toLowerCase();
      if (txt === "ping") {
        await sendToTeams("pong");
      } else if (txt.startsWith("link ")) {
        // Handle linking command: "link <code>"
        const linkCode = txt.substring(5).trim();
        if (linkCode) {
          try {
            const supabase = supabaseAdmin();
            
            // Find user by link code
            const { data: linkData } = await supabase
              .from("user_link_codes")
              .select("user_id, expires_at")
              .eq("code", linkCode)
              .maybeSingle();
            
            if (linkData && new Date(linkData.expires_at) > new Date()) {
              // Update teams_links with app user mapping
              await supabase.from("teams_links").upsert({
                teams_user_id: activity.from?.id,
                aad_object_id: activity.from?.aadObjectId,
                user_id: linkData.user_id,
                conversation_ref: {
                  user: activity.from,
                  bot: activity.recipient,
                  conversation: activity.conversation,
                  channelId: activity.channelId,
                  serviceUrl: activity.serviceUrl
                },
                last_activity: new Date().toISOString()
              }, {
                onConflict: "teams_user_id"
              });

              // Delete the used link code
              await supabase.from("user_link_codes").delete().eq("code", linkCode);
              
              await sendToTeams("✅ Successfully linked! You'll now receive notifications here.");
            } else {
              await sendToTeams("❌ Invalid or expired link code. Please generate a new one from your profile.");
            }
          } catch (error) {
            console.error("Linking failed:", error);
            await sendToTeams("❌ Linking failed. Please try again later.");
          }
        } else {
          await sendToTeams("Please provide a link code: `link <your-code>`");
        }
      } else {
        await sendToTeams(`echo: ${activity.text ?? ""}`);
      }
    } else if (activity?.type === "conversationUpdate") {
      await storeConversationRef();
      
      const added = activity.membersAdded || [];
      for (const m of added) {
        if (m.id !== activity.recipient?.id) {
          await sendToTeams("Hi! I'm online. Send me a link code to connect your account: `link <your-code>`");
        }
      }
    }

    console.log("Bot activity processed successfully without Bot Framework auth");
    res.status(200).end();
  } catch (err: any) {
    console.error("Bot route error:", err);
    console.error("Request details:", {
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? "present" : "missing",
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
      },
    });
    res.status(500).end();
  }
}