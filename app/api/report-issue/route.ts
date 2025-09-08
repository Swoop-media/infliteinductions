
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendTeamsMessage(message: string, recipientEmail: string = 'inductions@inflite.nz') {
  try {
    // Get Microsoft auth token
    const tenant = process.env.MICROSOFT_APP_TENANT_ID || "";
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams();
    tokenParams.set("client_id", process.env.MICROSOFT_APP_ID || "");
    tokenParams.set("client_secret", process.env.MICROSOFT_APP_PASSWORD || "");
    tokenParams.set("grant_type", "client_credentials");
    tokenParams.set("scope", "https://graph.microsoft.com/.default");

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Send chat message via Microsoft Graph API
    const chatUrl = `https://graph.microsoft.com/v1.0/chats`;
    
    // First, create a chat or find existing one with the user
    const chatPayload = {
      chatType: "oneOnOne",
      members: [
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${process.env.MICROSOFT_APP_ID}')`
        },
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember", 
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${recipientEmail}')`
        }
      ]
    };

    const chatResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(chatPayload)
    });

    let chatId;
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      chatId = chatData.id;
    } else {
      // If chat creation fails, try to find existing chat
      const existingChatsResponse = await fetch(`https://graph.microsoft.com/v1.0/me/chats`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      
      if (existingChatsResponse.ok) {
        const chats = await existingChatsResponse.json();
        const existingChat = chats.value.find((chat: any) => 
          chat.members?.some((member: any) => member.email === recipientEmail)
        );
        if (existingChat) {
          chatId = existingChat.id;
        }
      }
    }

    if (!chatId) {
      throw new Error("Could not create or find chat");
    }

    // Send message to the chat
    const messageUrl = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`;
    const messagePayload = {
      body: {
        contentType: "text",
        content: message
      }
    };

    const messageResponse = await fetch(messageUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messagePayload)
    });

    if (!messageResponse.ok) {
      throw new Error(`Message send failed: ${messageResponse.status}`);
    }

    return true;
  } catch (error) {
    console.error("Teams message failed:", error);
    
    // Fallback: Try to send via bot framework if available
    try {
      const botResponse = await fetch('/api/teams/bot/debug-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail,
          message: message
        })
      });
      
      return botResponse.ok;
    } catch (botError) {
      console.error("Bot fallback also failed:", botError);
      return false;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, attachments, context, userId } = await request.json();

    if (!message || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user details for additional context
    const supabase = supabaseAdmin();
    const { data: user } = await supabase
      .from('profiles')
      .select('full_name, email, first_name, last_name')
      .eq('id', userId)
      .single();

    const userName = user?.full_name || `${user?.first_name} ${user?.last_name}`.trim() || user?.email || 'Unknown User';

    // Enhanced message with user context
    const enhancedMessage = [
      message,
      "",
      "**Reported by:**",
      `• Name: ${userName}`,
      `• Email: ${user?.email || 'Not available'}`,
      `• User ID: ${userId}`,
      "",
      "---",
      "*This is an automated issue report from the training platform.*"
    ].join("\n");

    // Send to Teams
    const sent = await sendTeamsMessage(enhancedMessage);

    if (sent) {
      console.log(`✅ Issue report sent to inductions@inflite.nz from user ${userName}`);
      
      // Optionally log the report to database for tracking
      await supabase.from('issue_reports').insert({
        user_id: userId,
        message: message,
        context: context,
        attachments_count: attachments?.length || 0,
        sent_to_teams: true
      }).catch(err => {
        console.warn("Failed to log issue report:", err);
        // Don't fail the request if logging fails
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Failed to send report to Teams" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Issue report error:", error);
    return NextResponse.json(
      { error: "Failed to process issue report" },
      { status: 500 }
    );
  }
}
