// pages/api/teams/bot/messages.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  CloudAdapter,
  TurnContext,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

export const config = {
  api: {
    bodyParser: false,      // we’ll read the raw body ourselves
    externalResolver: true, // we fully control the response
  },
};

// ---------- Credentials & public cloud settings ----------
const MicrosoftAppId = process.env.MICROSOFT_APP_ID || "";
const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD || "";
const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID || ""; // required if SingleTenant
const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";

// Force PUBLIC cloud audience/scope (prevents “wrong tenant”/700016 issues)
const settings = {
  MicrosoftAppType,
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppTenantId,

  // Public cloud (NOT GCC/DoD)
  ToChannelFromBotLoginUrl: "https://login.microsoftonline.com/botframework.com",
  ToChannelFromBotOAuthScope: "https://api.botframework.com/.default",
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
    const body = await readJsonBody(req);

    // IMPORTANT: use processActivity(authHeader, body, ...) so we own the HTTP response.
    await adapter.processActivity(authHeader, body, async (context) => {
      await botLogic(context);
    });

    // If we got here, the activity was processed successfully.
    res.status(200).end();
  } catch (err: any) {
    // Typical auth failures: 401 — “No valid identity”, etc.
    console.error("Bot route error (processActivity):", err);
    const status = Number(err?.statusCode || err?.status || 500);
    if (!res.headersSent) res.status(status || 500).end();
  }
}
