
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { userId, email, message } = await request.json();
    
    if ((!userId && !email) || !message) {
      return NextResponse.json({ error: "Missing userId/email or message" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    let targetUserId = userId;
    
    // If email provided but no userId, look up the user
    if (!targetUserId && email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      
      if (!profile) {
        return NextResponse.json({ error: "User not found for email" }, { status: 404 });
      }
      
      targetUserId = profile.id;
    }
    
    // Get Teams link for this user
    const { data: teamsLink } = await supabase
      .from("teams_links")
      .select("conversation_ref")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!teamsLink?.conversation_ref) {
      return NextResponse.json({ 
        error: "User not linked to Teams", 
        userId: targetUserId,
        email: email 
      }, { status: 404 });
    }

    // Send message using Bot Framework API
    const MicrosoftAppId = process.env.MICROSOFT_APP_ID;
    const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD;
    const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE;
    const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID;

    // Get token
    const tenant = MicrosoftAppType === "SingleTenant" ? MicrosoftAppTenantId : "botframework.com";
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams();
    tokenParams.set("client_id", MicrosoftAppId || "");
    tokenParams.set("client_secret", MicrosoftAppPassword || "");
    tokenParams.set("grant_type", "client_credentials");
    tokenParams.set("scope", "https://api.botframework.com/.default");

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token request failed:", errorText);
      return NextResponse.json({ error: "Token acquisition failed" }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Parse conversation reference
    const conversationRef = teamsLink.conversation_ref;
    const serviceUrl = conversationRef.serviceUrl;
    const conversationId = conversationRef.conversation?.id;

    if (!serviceUrl || !conversationId) {
      return NextResponse.json({ error: "Invalid conversation reference" }, { status: 400 });
    }

    // Send proactive message
    const proactiveUrl = `${serviceUrl}/v3/conversations/${conversationId}/activities`;
    const activity = {
      type: "message",
      text: message,
      from: {
        id: MicrosoftAppId,
        name: "Learning Platform Bot"
      },
      recipient: conversationRef.user,
      conversation: conversationRef.conversation,
      channelId: conversationRef.channelId
    };

    const messageResponse = await fetch(proactiveUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(activity)
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error("Message send failed:", errorText);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Message sent successfully" });

  } catch (error) {
    console.error("Debug send error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
