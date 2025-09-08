import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendTeamsMessage(message: string, recipientEmail: string = 'inductions@inflite.nz') {
  try {
    console.log("📤 Attempting to send Teams message to:", recipientEmail);
    console.log("📝 Message preview:", message.substring(0, 150) + "...");

    // First try the existing bot debug-send endpoint
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    console.log("🌐 Using base URL:", baseUrl);
    
    const requestBody = {
      email: recipientEmail,
      message: message
    };
    console.log("📦 Request body:", { ...requestBody, message: requestBody.message.substring(0, 100) + "..." });

    const botResponse = await fetch(`${baseUrl}/api/teams/bot/debug-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log("📊 Bot endpoint response status:", botResponse.status);

    if (botResponse.ok) {
      console.log("✅ Teams message sent via bot endpoint");
      return true;
    } else {
      let errorData;
      try {
        errorData = await botResponse.json();
        console.log("❌ Bot endpoint failed with data:", errorData);
      } catch (parseError) {
        console.log("❌ Bot endpoint failed, couldn't parse error response:", parseError);
        const errorText = await botResponse.text().catch(() => 'No response text');
        console.log("📄 Raw error response:", errorText);
        errorData = { error: errorText };
      }

      // If user not linked to Teams, that's expected - return false
      if (botResponse.status === 404 && errorData.error?.includes("not linked")) {
        console.log("📧 User not linked to Teams, will rely on database logging only");
        return false;
      }

      // Log the specific error for debugging
      console.log("⚠️ Bot endpoint failed with status:", botResponse.status);
      console.log("⚠️ Error details:", errorData);
    }

    console.log("⚠️ Bot endpoint failed, trying fallback approach...");

    // Fallback: Log the issue (in production you might want email fallback)
    console.log("📧 Issue report for", recipientEmail, ":", message.substring(0, 200) + "...");
    return false;

  } catch (error) {
    console.error("❌ Teams message failed with exception:", error);
    console.log("📧 Issue report (fallback logging) for", recipientEmail, ":", message.substring(0, 200) + "...");
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("📝 Processing issue report...");

    const { message, attachments, context, userId } = await request.json();

    if (!message || !userId) {
      console.error("❌ Missing required fields:", { message: !!message, userId: !!userId });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log("👤 Getting user details for:", userId);

    // Get user details for additional context
    const supabase = supabaseAdmin();
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    if (userError) {
      console.warn("⚠️ Could not fetch user details:", userError);
    }

    const userName = user?.full_name || user?.email || 'Unknown User';

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

    console.log("📤 Sending Teams message...");

    // Send to the default recipient (inductions@inflite.nz)
    const recipientEmail = 'inductions@inflite.nz';
    console.log("📧 Sending Teams message to:", recipientEmail);

    // Send to Teams
    const sent = await sendTeamsMessage(enhancedMessage, recipientEmail);

    console.log(`✅ Issue report processed for user ${userName}, Teams sent: ${sent}`);

    // Always log the report to database for tracking
    try {
      await supabase.from('issue_reports').insert({
        user_id: userId,
        message: message,
        context: context,
        attachments_count: attachments?.length || 0,
        sent_to_teams: sent
      });
      console.log("📊 Issue report logged to database");
    } catch (dbError) {
      console.warn("⚠️ Failed to log issue report to database:", dbError);
      // Don't fail the request if logging fails
    }

    // Create an in-app notification for admins about the issue report
    try {
      const { data: adminUsers } = await supabase
        .from('profiles')
        .select(`
          id,
          user_roles!inner(
            roles!inner(name)
          )
        `)
        .eq('user_roles.roles.name', 'Admin');

      // Create notification for each admin
      if (adminUsers && adminUsers.length > 0) {
        const notifications = adminUsers.map(admin => ({
          recipient_id: admin.id,
          type: 'issue_report',
          payload: {
            reporter_id: userId,
            reporter_name: userName,
            reporter_email: user?.email,
            message: message.substring(0, 200) + (message.length > 200 ? '...' : ''),
            attachments_count: attachments?.length || 0,
            sent_to_teams: sent,
            created_at: new Date().toISOString(),
            event_id: `issue_report_${userId}_${Date.now()}`
          },
          read: false
        }));

        await supabase.from('notifications').insert(notifications);
        console.log(`📬 Created ${notifications.length} admin notifications for issue report`);
      }
    } catch (notificationError) {
      console.warn("⚠️ Failed to create admin notifications:", notificationError);
      // Don't fail the request if notification creation fails
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Issue report error:", error);
    return NextResponse.json(
      { error: "Failed to process issue report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}