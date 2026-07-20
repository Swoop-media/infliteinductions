// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { postIssueReportToChannel } from '@/lib/teams/channel-webhook';

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const supabaseSession = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabaseSession.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📝 Processing issue report...");

    const { message, attachments, context, userId } = await request.json();

    if (!message || !userId) {
      console.error("❌ Missing required fields:", { message: !!message, userId: !!userId });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the submitted userId matches the authenticated user — prevents impersonation
    if (userId !== user.id) {
      console.error("❌ userId mismatch: submitted", userId, "authenticated", user.id);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log("👤 Getting user details for:", user.id);

    // Get user details for additional context
    const supabase = supabaseAdmin();
    const { data: profile, error: userError } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.warn("⚠️ Could not fetch user details:", userError);
    }

    const userName = profile?.full_name || profile?.email || 'Unknown User';

    console.log("📤 Posting issue report to Teams channel webhook...");

    const sent = await postIssueReportToChannel({
      reporterName: userName,
      reporterEmail: profile?.email || '',
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
        user_id: user.id,
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

    return NextResponse.json({ success: true, sentToTeams: sent });

  } catch (error) {
    console.error("❌ Issue report error:", error);
    return NextResponse.json(
      { error: "Failed to process issue report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
