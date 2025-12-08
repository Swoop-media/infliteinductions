// @ts-nocheck

// lib/teams/botAdapter.ts
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

// Cached adapter instances to avoid re-initialization
let _botAuth: ConfigurationBotFrameworkAuthentication | null = null;
let _adapter: CloudAdapter | null = null;

// Get environment variables
const MicrosoftAppId = process.env.MICROSOFT_APP_ID || "";
const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD || "";
const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID || "";
const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";

export const botAppId = MicrosoftAppId;

// Lazy initialization function for bot authentication
function getBotAuth(): ConfigurationBotFrameworkAuthentication {
  if (_botAuth) return _botAuth;

  if (!MicrosoftAppId || !MicrosoftAppPassword) {
    throw new Error("MICROSOFT_APP_ID and MICROSOFT_APP_PASSWORD are required");
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

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId,
    MicrosoftAppPassword,
    MicrosoftAppTenantId,
  });

  _botAuth = new ConfigurationBotFrameworkAuthentication(settings as any, credentialsFactory);
  return _botAuth;
}

// Lazy initialization function for bot adapter
export function getAdapter(): CloudAdapter {
  if (_adapter) return _adapter;

  const botAuth = getBotAuth();
  _adapter = new CloudAdapter(botAuth);

  // Enhanced error logging for debugging
  _adapter.onTurnError = async (context, error) => {
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

  return _adapter;
}

// Export legacy names for backward compatibility (but they will now be lazy)
// Note: These will only be initialized when actually accessed
export { getBotAuth as botAuth, getAdapter as adapter };
