// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postIssueReportToChannel } from '@/lib/teams/channel-webhook';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
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

    console.log("📤 Posting issue report to Teams channel webhook...");

    const sent = await postIssueReportToChannel({
      reporterName: userName,
      reporterEmail: user?.email || '',
      message,
      pageUrl: context?.url,
      userAgent: context?.userAgent,
      platform: context?.platform,
      viewport: context?.viewport,
      attachmentsCount: attachments?.length || 0,
      timestamp: context?.timestamp || new Date().toISOString(),
    });

    console.log(`✅ Issue report processed for user ${userName}, webhook sent: ${sent}`);

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
