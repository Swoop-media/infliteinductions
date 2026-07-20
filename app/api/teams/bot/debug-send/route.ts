// @ts-nocheck
import { NextResponse, NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    const { email, message, userId } = await request.json();

    console.log("🔍 Debug send request:", { email, hasMessage: !!message, userId });

    // Get Microsoft Bot credentials
    const MicrosoftAppId = process.env.MICROSOFT_APP_ID;
    const MicrosoftAppPassword = process.env.MICROSOFT_APP_PASSWORD;
    const MicrosoftAppType = process.env.MICROSOFT_APP_TYPE;
    const MicrosoftAppTenantId = process.env.MICROSOFT_APP_TENANT_ID;

    if (!MicrosoftAppId || !MicrosoftAppPassword || !MicrosoftAppType || !MicrosoftAppTenantId) {
      console.log("❌ Teams bot credentials missing");
      return NextResponse.json(
        { error: "Teams bot not configured - credentials missing" },
        { status: 503 }
      );
    }

    // If userId is provided, use that; otherwise lookup by email
    let targetUserId = userId;
    if (!targetUserId && email) {
      console.log("📧 Looking up user by email:", email);
      const supabase = supabaseAdmin();
      const { data: userRecord, error: userError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('email', email)
        .single();

      if (userError) {
        console.log("❌ User lookup error:", userError);
      }

      if (userRecord) {
        targetUserId = (userRecord as any).id;
        console.log("✅ Found user:", { id: targetUserId, name: (userRecord as any).full_name });
      } else {
        console.log("❌ User not found");
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
    }

    if (!targetUserId) {
      console.log("❌ No user ID or email provided");
      return NextResponse.json(
        { error: "No user ID or email provided" },
        { status: 400 }
      );
    }

    // Get Teams link for the user
    console.log("🔗 Looking up Teams link for user:", targetUserId);
    const supabase = supabaseAdmin();
    const { data: teamsLink, error } = await supabase
      .from('teams_links')
      .select('conversation_ref, teams_user_id, user_id, aad_object_id')
      .eq('user_id', targetUserId)
      .single();

    if (error) {
      console.log("❌ Teams link lookup error:", error);
      return NextResponse.json(
        { error: "Database error looking up Teams link" },
        { status: 500 }
      );
    }

    if (!teamsLink) {
      console.log("⚠️ No Teams link found for user:", targetUserId);
      return NextResponse.json(
        { error: "User not linked to Teams" },
        { status: 404 }
      );
    }

    // Parse conversation reference
    const conversationRef = (teamsLink as any).conversation_ref;
    const serviceUrl = conversationRef.serviceUrl;
    const conversationId = conversationRef.conversation?.id;

    if (!serviceUrl || !conversationId) {
      console.error("❌ Invalid conversation reference");
      return NextResponse.json({ error: "Invalid conversation reference" }, { status: 400 });
    }

    // Validate serviceUrl is a known Microsoft domain to prevent SSRF
    if (!isAllowedServiceUrl(serviceUrl)) {
      console.error("❌ Blocked serviceUrl with untrusted domain:", serviceUrl);
      return NextResponse.json({ error: "Invalid conversation reference" }, { status: 400 });
    }

    // Get Bot Framework token
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
      console.error("❌ Token request failed:", errorText);
      return NextResponse.json({ error: "Token acquisition failed" }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

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
      console.error("❌ Message send failed:", errorText);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    console.log("✅ Message sent successfully to Teams.");
    return NextResponse.json({ success: true, message: "Message sent successfully" });

  } catch (error) {
    console.error("❌ Internal server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Validates that a Teams serviceUrl is a known Microsoft domain.
 * Prevents SSRF: attacker-stored serviceUrl values in teams_links must not cause
 * the server to send the bot OAuth token to an attacker-controlled endpoint.
 */
function isAllowedServiceUrl(serviceUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(serviceUrl);
    if (protocol !== "https:") return false;
    return (
      hostname.endsWith(".microsoft.com") ||
      hostname.endsWith(".botframework.com") ||
      hostname === "smba.trafficmanager.net"
    );
  } catch {
    return false;
  }
}
