
// lib/teams/botAdapter.ts
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

// Use consistent environment variable names
const settings = {
  MicrosoftAppType: process.env.MICROSOFT_APP_TYPE || "MultiTenant",
  MicrosoftAppId: process.env.MICROSOFT_APP_ID || "",
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD || "",
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID || "",
  
  // Force public cloud endpoints to avoid tenant issues
  ToChannelFromBotLoginUrl: "https://login.microsoftonline.com/botframework.com",
  ToChannelFromBotOAuthScope: "https://api.botframework.com/.default",
};

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: settings.MicrosoftAppId,
  MicrosoftAppPassword: settings.MicrosoftAppPassword,
  MicrosoftAppTenantId: settings.MicrosoftAppTenantId,
});

export const botAuth = new ConfigurationBotFrameworkAuthentication(settings as any, credentialsFactory);
export const adapter = new CloudAdapter(botAuth);
export const botAppId = settings.MicrosoftAppId;

// Enhanced error logging for debugging
adapter.onTurnError = async (context, error) => {
  console.error("Bot unhandled error:", error);
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    statusCode: (error as any).statusCode,
  });
  try { 
    await context.sendActivity("Sorry — something went wrong."); 
  } catch (sendError) {
    console.error("Failed to send error message:", sendError);
  }
};
