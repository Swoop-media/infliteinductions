
// lib/teams/botAdapter.ts
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

// Validate environment variables
const MicrosoftAppId = process.env.MICROSOFT_APP_ID || "";
const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD || "";
const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID || "";
const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";

// Log configuration for debugging (without sensitive data)
console.log("Bot configuration:", {
  MicrosoftAppType,
  MicrosoftAppId: MicrosoftAppId ? `${MicrosoftAppId.substring(0, 8)}...` : "MISSING",
  MicrosoftAppPassword: MicrosoftAppPassword ? "SET" : "MISSING",
  MicrosoftAppTenantId: MicrosoftAppTenantId ? `${MicrosoftAppTenantId.substring(0, 8)}...` : "MISSING",
});

if (!MicrosoftAppId || !MicrosoftAppPassword) {
  throw new Error("MICROSOFT_APP_ID and MICROSOFT_APP_PASSWORD are required");
}

// Re-enable authentication with correct SingleTenant configuration
const settings = {
  MicrosoftAppType,
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppTenantId,
  
  // Use correct tenant for SingleTenant apps
  ToChannelFromBotLoginUrl: `https://login.microsoftonline.com/${MicrosoftAppTenantId}/oauth2/v2.0/token`,
  ToChannelFromBotOAuthScope: "https://api.botframework.com/.default",
  
  // Accept tokens from the Bot Framework
  ValidTokenIssuers: [
    "https://api.botframework.com",
    `https://sts.windows.net/${MicrosoftAppTenantId}/`,
    `https://login.microsoftonline.com/${MicrosoftAppTenantId}/v2.0`,
  ],
  
  AuthenticationDisabled: false,
};

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId,
  MicrosoftAppPassword,
  MicrosoftAppTenantId,
});

export const botAuth = new ConfigurationBotFrameworkAuthentication(settings as any, credentialsFactory);
export const adapter = new CloudAdapter(botAuth);
export const botAppId = MicrosoftAppId;

// Enhanced error logging for debugging
adapter.onTurnError = async (context, error) => {
  console.error("Bot unhandled error:", error);
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    statusCode: (error as any).statusCode,
    code: (error as any).code,
  });
  try { 
    await context.sendActivity("Sorry — something went wrong."); 
  } catch (sendError) {
    console.error("Failed to send error message:", sendError);
  }
};
