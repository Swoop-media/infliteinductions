
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

export const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;

export const AUTH_CODE_URL_PARAMETERS = {
  scopes: ["openid", "profile", "email", "User.Read"],
  redirectUri: REDIRECT_URI,
};
