
// @ts-nocheck
// pages/api/teams/debug/auth.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const appId = process.env.MICROSOFT_APP_ID;
  const appPassword = process.env.MICROSOFT_APP_PASSWORD;
  const tenantId = process.env.MICROSOFT_APP_TENANT_ID;
  const appType = process.env.MICROSOFT_APP_TYPE;

  // Check if environment variables are set
  const envCheck = {
    MICROSOFT_APP_ID: !!appId,
    MICROSOFT_APP_PASSWORD: !!appPassword,
    MICROSOFT_APP_TENANT_ID: !!tenantId,
    MICROSOFT_APP_TYPE: !!appType,
  };

  // Test token acquisition
  let tokenTest = { success: false, error: null };
  try {
    const tenant = appType === "SingleTenant" ? tenantId : "organizations";
    const params = new URLSearchParams();
    params.set("client_id", appId || "");
    params.set("client_secret", appPassword || "");
    params.set("grant_type", "client_credentials");
    params.set("scope", "https://api.botframework.com/.default");

    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (response.ok) {
      const json = await response.json();
      tokenTest.success = !!json.access_token;
    } else {
      const errorText = await response.text();
      tokenTest.error = `HTTP ${response.status}: ${errorText}`;
    }
  } catch (error: any) {
    tokenTest.error = error.message;
  }

  res.status(200).json({
    environmentVariables: envCheck,
    tokenAcquisition: tokenTest,
    botEndpoint: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/teams/bot/messages`,
  });
}
