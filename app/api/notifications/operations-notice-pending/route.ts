// @ts-nocheck
// API endpoint to send daily pending acknowledgement reports to responsible persons
// Should be called daily at 8am NZT by a cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { toAbsoluteUrl } from "@/lib/utils/url";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!url || !key) {
    throw new Error("Supabase admin environment variables not set");
  }
  
  return createClient(url, key, {
    auth: { persistSession: false },
    // Hard cap on Supabase HTTP round-trips so connection blips can't hang
    // requests indefinitely and saturate the VM (Aug 2026 outages).
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { data: notices, error: noticesError } = await supabase
      .from("operations_notices")
      .select("id, title, responsible_person, require_acknowledgement")
      .eq("status", "published")
      .eq("require_acknowledgement", true)
      .not("responsible_person", "is", null);

    if (noticesError) {
      console.error("Error fetching notices:", noticesError);
      return NextResponse.json({ 
        error: "Failed to fetch notices",
        details: noticesError.message 
      }, { status: 500 });
    }

    if (!notices || notices.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: "No notices requiring acknowledgement with responsible persons",
        notificationsSent: 0
      });
    }

    const noticeIds = notices.map(n => n.id);
    
    const { data: assignments, error: assignErr } = await supabase
      .from("operations_notice_assignments")
      .select("id, user_id, notice_id")
      .in("notice_id", noticeIds);

    if (assignErr) {
      console.error("Error fetching assignments:", assignErr);
      return NextResponse.json({ 
        error: "Failed to fetch assignments",
        details: assignErr.message 
      }, { status: 500 });
    }

    const { data: acknowledgements, error: ackErr } = await supabase
      .from("operations_notice_acknowledgements")
      .select("user_id, notice_id")
      .in("notice_id", noticeIds);

    if (ackErr) {
      console.error("Error fetching acknowledgements:", ackErr);
    }

    const ackSet = new Set(
      (acknowledgements || []).map(a => `${a.notice_id}:${a.user_id}`)
    );

    const pendingByNotice = new Map<string, string[]>();
    for (const assignment of (assignments || [])) {
      const key = `${assignment.notice_id}:${assignment.user_id}`;
      if (!ackSet.has(key)) {
        if (!pendingByNotice.has(assignment.notice_id)) {
          pendingByNotice.set(assignment.notice_id, []);
        }
        pendingByNotice.get(assignment.notice_id)!.push(assignment.user_id);
      }
    }

    const allPendingUserIds = [...new Set(
      Array.from(pendingByNotice.values()).flat()
    )];

    let userProfileMap = new Map<string, { full_name: string | null; email: string | null; archived_at: string | null }>();
    if (allPendingUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, archived_at")
        .in("id", allPendingUserIds);
      
      for (const p of (profiles || [])) {
        userProfileMap.set(p.id, { full_name: p.full_name, email: p.email, archived_at: p.archived_at });
      }
    }

    const responsiblePersonIds = [...new Set(notices.map(n => n.responsible_person).filter(Boolean))];
    let responsibleProfileMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (responsiblePersonIds.length > 0) {
      const { data: respProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", responsiblePersonIds);
      
      for (const p of (respProfiles || [])) {
        responsibleProfileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }

    let notificationsSent = 0;
    const noticesUrl = toAbsoluteUrl("/app/creator?tab=operations-notices");

    for (const notice of notices) {
      const allNoticePendingIds = pendingByNotice.get(notice.id) || [];
      // Exclude archived users - they should not appear in the pending list
      const pendingUserIds = allNoticePendingIds.filter(uid => {
        const profile = userProfileMap.get(uid);
        return !profile?.archived_at;
      });

      if (pendingUserIds.length === 0) {
        continue;
      }

      const responsiblePersonId = notice.responsible_person;
      if (!responsiblePersonId) continue;

      const pendingUsers = pendingUserIds.map(uid => {
        const profile = userProfileMap.get(uid);
        return profile?.full_name || profile?.email || "Unknown User";
      });

      const summaryLines = [
        `📋 Pending Acknowledgements for: ${notice.title}`,
        ``,
        `${pendingUsers.length} user${pendingUsers.length !== 1 ? 's' : ''} have not acknowledged:`,
        ...pendingUsers.slice(0, 25).map(name => `• ${name}`),
      ];

      if (pendingUsers.length > 25) {
        summaryLines.push(`... and ${pendingUsers.length - 25} more`);
      }

      summaryLines.push(``);
      summaryLines.push(`View in Creator section: ${noticesUrl}`);

      await notifyUser(
        responsiblePersonId,
        "operations_notice_pending_ack",
        {
          noticeTitle: notice.title,
          noticeId: notice.id,
          pendingCount: pendingUsers.length,
          pendingUsers: pendingUsers.slice(0, 25),
          summary: summaryLines,
          url: noticesUrl,
        },
        { 
          eventId: `ops_notice_pending_${notice.id}_${todayStr}`,
          skipTeams: false 
        }
      );
      notificationsSent++;
    }

    const summary = {
      noticesChecked: notices.length,
      noticesWithPending: pendingByNotice.size,
      notificationsSent,
      timestamp: new Date().toISOString()
    };

    console.log("Operations notice pending acknowledgement reports sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Operations notice pending report error:", error);
    return NextResponse.json({ 
      error: "Failed to send pending acknowledgement reports",
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: "Operations Notice Pending Acknowledgements endpoint. Use POST to trigger.",
    usage: "POST with Authorization: Bearer <CRON_SECRET>"
  });
}
