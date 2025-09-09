// @ts-nocheck
// lib/teams/proactive.ts
import { ConversationReference, TurnContext } from "botbuilder";
import { adapter, botAppId } from "./botAdapter";

export async function sendProactive(conversationRef: any, text: string) {
  console.log("🚀 sendProactive called with text:", text.substring(0, 100) + "...");
  console.log("📋 Full conversation ref structure:", JSON.stringify(conversationRef, null, 2));
  console.log("🔗 Conversation ref summary:", {
    serviceUrl: conversationRef.serviceUrl,
    conversationId: conversationRef.conversation?.id,
    fromId: conversationRef.user?.id,
    botId: conversationRef.bot?.id,
    channelId: conversationRef.channelId,
    tenantId: conversationRef.conversation?.tenantId
  });

  // Get access token - use correct tenant for SingleTenant bots
  const appType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";
  const tenantId = process.env.MICROSOFT_APP_TENANT_ID || "";
  const tenant = appType === "SingleTenant" ? tenantId : "botframework.com";
  
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const tokenParams = new URLSearchParams();
  tokenParams.set("client_id", process.env.MICROSOFT_APP_ID || "");
  tokenParams.set("client_secret", process.env.MICROSOFT_APP_PASSWORD || "");
  tokenParams.set("grant_type", "client_credentials");
  tokenParams.set("scope", "https://api.botframework.com/.default");

  console.log("🔑 Requesting access token from:", tokenUrl);
  console.log("🔐 Token request params:", {
    client_id: (process.env.MICROSOFT_APP_ID || "").substring(0, 8) + "...",
    grant_type: "client_credentials",
    scope: "https://api.botframework.com/.default",
    hasClientSecret: !!(process.env.MICROSOFT_APP_PASSWORD)
  });
  
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  console.log("📊 Token response status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token request failed:", tokenResponse.status, errorText);
    throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  console.log("Access token obtained successfully");

  const replyUrl = `${conversationRef.serviceUrl}/v3/conversations/${conversationRef.conversation.id}/activities`;

  const messageActivity = {
    type: "message",
    from: { id: botAppId },
    recipient: { id: conversationRef.user.id },
    conversation: { id: conversationRef.conversation.id },
    serviceUrl: conversationRef.serviceUrl,
    text: text,
    // Attachments can be added here if needed
  };

  console.log("Sending message to:", replyUrl);
  console.log("Message activity:", JSON.stringify(messageActivity, null, 2));

  const messageResponse = await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messageActivity)
  });

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    console.error("Message send failed:", messageResponse.status, errorText);
    throw new Error(`Message send failed: ${messageResponse.status} - ${errorText}`);
  }

  const result = await messageResponse.json();
  console.log("Message sent successfully:", result);
  return result;
}