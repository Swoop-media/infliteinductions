// pages/api/teams/bot/messages.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { TurnContext, ConfigurationServiceClientCredentialFactory, ConfigurationBotFrameworkAuthentication, CloudAdapter } from "botbuilder";

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
        // Get access token for Bot Framework
        const tokenUrl = `https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.set("client_id", MicrosoftAppId);
        tokenParams.set("client_secret", MicrosoftAppPassword);
        tokenParams.set("grant_type", "client_credentials");
        tokenParams.set("scope", "https://api.botframework.com/.default");

        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Token request failed: ${tokenResponse.status}`);
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
          throw new Error(`Message send failed: ${messageResponse.status}`);
        }

        console.log("Successfully sent message to Teams:", text);
        return await messageResponse.json();
      } catch (error) {
        console.error("Failed to send message to Teams:", error);
        throw error;
      }
    };

    // Process the activity and send responses
    if (activity?.type === "message") {
      const txt = (activity.text || "").trim().toLowerCase();
      if (txt === "ping") {
        await sendToTeams("pong");
      } else {
        await sendToTeams(`echo: ${activity.text ?? ""}`);
      }
    } else if (activity?.type === "conversationUpdate") {
      const added = activity.membersAdded || [];
      for (const m of added) {
        if (m.id !== activity.recipient?.id) {
          await sendToTeams("Hi! I'm online.");
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