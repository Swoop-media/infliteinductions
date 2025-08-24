
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const appId = process.env.MICROSOFT_APP_ID;
  const appPassword = process.env.MICROSOFT_APP_PASSWORD;
  const tenantId = process.env.MICROSOFT_APP_TENANT_ID;
  const appType = process.env.MICROSOFT_APP_TYPE;

  if (!appId || !appPassword) {
    return res.status(500).json({
      success: false,
      error: "Missing MICROSOFT_APP_ID or MICROSOFT_APP_PASSWORD"
    });
  }

  try {
    // Use the correct tenant for token acquisition
    const tenant = appType === "SingleTenant" ? tenantId : "botframework.com";
    
    const params = new URLSearchParams();
    params.set("client_id", appId);
    params.set("client_secret", appPassword);
    params.set("grant_type", "client_credentials");
    params.set("scope", "https://api.botframework.com/.default");

    console.log("Token request details:", {
      tenant,
      appType,
      scope: "https://api.botframework.com/.default",
      endpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    });

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
      return res.status(200).json({
        success: true,
        hasToken: !!json.access_token,
        tokenType: json.token_type,
        expiresIn: json.expires_in,
        scope: json.scope,
        tenant: tenant
      });
    } else {
      const errorText = await response.text();
      console.error("Token acquisition failed:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      return res.status(response.status).json({
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        tenant: tenant
      });
    }
  } catch (error: any) {
    console.error("Token test error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
