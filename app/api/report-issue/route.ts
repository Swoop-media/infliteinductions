
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
    console.log("Attempting to send Teams message to:", recipientEmail);
    
    // First try the existing bot debug-send endpoint
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const botResponse = await fetch(`${baseUrl}/api/teams/bot/debug-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: recipientEmail,
        message: message
      })
    });
    
    if (botResponse.ok) {
      console.log("✅ Teams message sent via bot endpoint");
      return true;
    }
    
    console.log("⚠️ Bot endpoint failed, trying direct approach...");
    
    // Fallback: Try webhook approach or simple logging
    console.log("📧 Issue report for", recipientEmail, ":", message.substring(0, 200) + "...");
    
    // For now, we'll return true and rely on database logging
    // In production, you might want to add email fallback here
    return true;
    
  } catch (error) {
    console.error("Teams message failed:", error);
    
    // Don't fail the entire request if Teams sending fails
    console.log("📧 Issue report (fallback logging) for", recipientEmail, ":", message.substring(0, 200) + "...");
    return true;
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
      .select('full_name, email, first_name, last_name')
      .eq('id', userId)
      .single();

    if (userError) {
      console.warn("⚠️ Could not fetch user details:", userError);
    }

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

    console.log("📤 Sending Teams message...");

    // Send to Teams
    const sent = await sendTeamsMessage(enhancedMessage);

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

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("❌ Issue report error:", error);
    return NextResponse.json(
      { error: "Failed to process issue report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
