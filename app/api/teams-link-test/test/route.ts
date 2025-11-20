// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has admin role
    const { data: hasAdminRole, error: roleError } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    // Also check for Senior Management if not admin
    let hasSeniorRole = false;
    if (!hasAdminRole) {
      const { data: seniorCheck } = await supabase.rpc("has_role", {
        uid: user.id,
        role_name: "Senior Management"
      });
      hasSeniorRole = !!seniorCheck;
    }

    if (!hasAdminRole && !hasSeniorRole) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "No users selected" }, { status: 400 });
    }

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

    // Test each user
    const results = [];
    const adminSupabase = supabaseAdmin();

    for (const userId of userIds) {
      console.log(`\n🔍 Testing Teams link for user: ${userId}`);
      
      // Get user info
      const { data: profile, error: profileError } = await adminSupabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        console.log(`❌ User not found: ${userId}`);
        results.push({
          userId,
          email: "Unknown",
          full_name: "Unknown User",
          success: false,
          error: "User not found in database",
          hasTeamsLink: false,
          conversationRefFound: false,
          diagnostics: {
            issue: "User profile not found in database",
            suggestion: "Verify the user ID is correct"
          }
        });
        continue;
      }

      // Check Teams link
      const { data: teamsLink, error: linkError } = await adminSupabase
        .from("teams_links")
        .select("teams_user_id, conversation_ref, last_activity")
        .eq("user_id", userId)
        .maybeSingle();

      if (!teamsLink || !teamsLink.conversation_ref) {
        console.log(`⚠️ No Teams link or conversation reference for user: ${profile.email}`);
        results.push({
          userId,
          email: profile.email,
          full_name: profile.full_name,
          success: false,
          error: "Teams not linked",
          hasTeamsLink: !!teamsLink,
          conversationRefFound: false,
          teamsUserId: teamsLink?.teams_user_id,
          lastActivity: teamsLink?.last_activity,
          diagnostics: {
            issue: !teamsLink 
              ? "User has not linked their Teams account"
              : "Teams is linked but conversation reference is missing",
            suggestion: !teamsLink
              ? "User needs to send a message to the bot or use the link command in Teams"
              : "User needs to message the bot again to re-establish the conversation"
          }
        });
        continue;
      }

      // Try to send a test message
      try {
        const testMessage = `🔔 **Teams Link Test**\\n\\nThis is a test message from the admin panel to verify your Teams connection is working properly.\\n\\nTime: ${new Date().toLocaleString()}\\n\\nIf you receive this message, your Teams integration is functioning correctly.`;
        
        // Get access token
        const appType = MicrosoftAppType || "MultiTenant";
        const tenantId = MicrosoftAppTenantId || "";
        const tenant = appType === "SingleTenant" ? tenantId : "botframework.com";
        
        const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.set("client_id", MicrosoftAppId);
        tokenParams.set("client_secret", MicrosoftAppPassword);
        tokenParams.set("grant_type", "client_credentials");
        tokenParams.set("scope", "https://api.botframework.com/.default");
        
        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("Token request failed:", tokenResponse.status, errorText);
          throw new Error(`Token acquisition failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        // Send the message
        const conversationRef = teamsLink.conversation_ref;
        const replyUrl = `${conversationRef.serviceUrl}/v3/conversations/${conversationRef.conversation.id}/activities`;

        const messageActivity = {
          type: "message",
          from: { id: MicrosoftAppId },
          recipient: conversationRef.user,
          text: testMessage,
          textFormat: "markdown"
        };

        const messageResponse = await fetch(replyUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(messageActivity),
        });

        if (!messageResponse.ok) {
          const errorData = await messageResponse.text();
          console.error("Message send failed:", messageResponse.status, errorData);
          
          // Parse the error to provide specific diagnostics
          let diagnostics = {
            issue: "Failed to send message via Teams API",
            suggestion: "User may need to re-link their Teams account or the conversation may have expired"
          };
          
          if (messageResponse.status === 403) {
            diagnostics = {
              issue: "Bot is not authorized to send messages to this user",
              suggestion: "User needs to re-add or re-authorize the bot in Teams"
            };
          } else if (messageResponse.status === 404) {
            diagnostics = {
              issue: "Conversation not found",
              suggestion: "User needs to send a message to the bot to re-establish conversation"
            };
          }
          
          results.push({
            userId,
            email: profile.email,
            full_name: profile.full_name,
            success: false,
            error: `Teams API error: ${messageResponse.status}`,
            hasTeamsLink: true,
            conversationRefFound: true,
            teamsUserId: teamsLink.teams_user_id,
            lastActivity: teamsLink.last_activity,
            diagnostics
          });
        } else {
          console.log(`✅ Message sent successfully to: ${profile.email}`);
          results.push({
            userId,
            email: profile.email,
            full_name: profile.full_name,
            success: true,
            hasTeamsLink: true,
            conversationRefFound: true,
            teamsUserId: teamsLink.teams_user_id,
            lastActivity: teamsLink.last_activity
          });
        }
        
      } catch (error: any) {
        console.error(`❌ Error sending Teams message to ${profile.email}:`, error);
        results.push({
          userId,
          email: profile.email,
          full_name: profile.full_name,
          success: false,
          error: error.message || "Unknown error occurred",
          hasTeamsLink: true,
          conversationRefFound: true,
          teamsUserId: teamsLink.teams_user_id,
          lastActivity: teamsLink.last_activity,
          diagnostics: {
            issue: "Failed to send message",
            suggestion: "Check Teams bot configuration and user's Teams connection"
          }
        });
      }
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Test Complete: ${successCount} succeeded, ${failureCount} failed`);

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: successCount,
        failure: failureCount
      }
    });
    
  } catch (error: any) {
    console.error("Error in teams-link-test/test API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}