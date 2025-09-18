// @ts-nocheck

// lib/auth/microsoft.ts
import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.MICROSOFT_APP_ID!,
    clientSecret: process.env.MICROSOFT_APP_PASSWORD!,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_APP_TENANT_ID}`,
  },
};

export const msalInstance = new ConfidentialClientApplication(msalConfig);

// Note: REDIRECT_URI is now dynamically determined based on the request host
// in the route handlers to support both development and production environments

export const AUTH_CODE_URL_PARAMETERS = {
  scopes: [
    "openid", 
    "profile", 
    "email", 
    "User.Read",
    "Files.Read",
    "Files.Read.All",
    "Sites.Read.All",
    "offline_access"
  ],
  // redirectUri will be added dynamically in the route handlers
};
