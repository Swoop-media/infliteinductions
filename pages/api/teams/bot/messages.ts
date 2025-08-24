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
  
  AuthenticationDisabled: false,
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
    const authHeader = (req.headers.authorization as string) || "";
    const activity = await readJsonBody(req);

    console.log("Processing bot activity:", {
      hasAuthHeader: Boolean(req.headers.authorization),
      authHeaderPrefix: authHeader ? authHeader.substring(0, 20) + "..." : "none",
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

    // IMPORTANT: use processActivity(authHeader, body, ...) so we own the HTTP response.
    await adapter.processActivity(authHeader, activity, async (context) => {
      await botLogic(context);
    });

    // If we got here, the activity was processed successfully.
    res.status(200).end();
  } catch (err: any) {
    // Typical auth failures: 401 — "No valid identity", etc.
    console.error("Bot route error (processActivity):", err);
    console.error("Request details:", {
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? "present" : "missing",
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
      },
    });
    const status = Number(err?.statusCode || err?.status || 500);
    if (!res.headersSent) res.status(status || 500).end();
  }
}