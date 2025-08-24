// lib/teams/botAdapter.ts
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID ?? "",
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD ?? "",
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? "",
});

export const botAuth = new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);
export const adapter = new CloudAdapter(botAuth);
export const botAppId = process.env.MICROSOFT_APP_ID ?? "";

// (optional) central error logging
adapter.onTurnError = async (context, error) => {
  console.error("Bot unhandled error:", error);
  try { await context.sendActivity("Sorry — something went wrong."); } catch {}
};
