// @ts-nocheck
// Debug endpoint to check notification system health
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const today = new Date();
    
    // 1. Check recent notifications created in the last 24 hours
    const twentyFourHoursAgo = new Date(today);
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);
    
    const { data: recentNotifications, error: notifError } = await supabase
      .from("notifications")
      .select("id, recipient_id, type, created_at, read, payload")
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    
    // 2. Check Teams links
    const { data: teamsLinks, error: teamsError } = await supabase
      .from("teams_links")
      .select("user_id, teams_user_id, created_at")
      .limit(10);
    
    // 3. Check environment variables
    const envCheck = {
      SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      MICROSOFT_APP_ID: !!process.env.MICROSOFT_APP_ID,
      MICROSOFT_APP_PASSWORD: !!process.env.MICROSOFT_APP_PASSWORD,
      MICROSOFT_APP_TENANT_ID: !!process.env.MICROSOFT_APP_TENANT_ID,
      CRON_SECRET: !!process.env.CRON_SECRET,
    };
    
    // 4. Check if there are any expiring items that should trigger notifications
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    // Check documents that should trigger notifications
    const { data: expiringDocs, error: docsError } = await supabase
      .from("learner_documents")
      .select("id, title, expires_on, user_id")
      .not("expires_on", "is", null)
      .or("status.is.null,status.neq.replaced")
      .gte("expires_on", today.toISOString())
      .lte("expires_on", thirtyDaysFromNow.toISOString())
      .limit(10);
    
    // Check completed course assignments that might need retake reminders
    const { data: completedCourses, error: coursesError } = await supabase
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        completed_at,
        assignment_status
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null)
      .limit(10);
    
    // Check completed authorization assignments
    const { data: completedAuths, error: authsError } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status,
        completed_at
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null)
      .limit(10);
    
    // 5. Get admin users for daily reports
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id, role_id");
    
    const { data: roles } = await supabase
      .from("roles")
      .select("id, name")
      .eq("name", "Admin");
    
    const adminRoleId = roles?.[0]?.id;
    const adminUserIds = adminRoles?.filter(ur => ur.role_id === adminRoleId).map(ur => ur.user_id) || [];
    
    // 6. Test if notification endpoints are accessible
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    let endpointsStatus = {};
    const endpoints = [
      "/api/notifications/document-expiry",
      "/api/notifications/authorization-expiry",
      "/api/notifications/retake-reminders",
      "/api/notifications/daily-admin-report"
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'GET', // Just check if endpoint exists
        });
        endpointsStatus[endpoint] = {
          status: response.status,
          ok: response.ok
        };
      } catch (error) {
        endpointsStatus[endpoint] = {
          status: 'error',
          error: error.message
        };
      }
    }
    
    // 7. Count notifications by type
    const { data: notificationCounts } = await supabase
      .from("notifications")
      .select("type")
      .gte("created_at", twentyFourHoursAgo.toISOString());
    
    const countsByType = {};
    (notificationCounts || []).forEach(n => {
      countsByType[n.type] = (countsByType[n.type] || 0) + 1;
    });
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        variablesSet: envCheck,
        missingVars: Object.keys(envCheck).filter(k => !envCheck[k])
      },
      notifications: {
        recentCount: recentNotifications?.length || 0,
        recent: recentNotifications?.slice(0, 5).map(n => ({
          id: n.id,
          type: n.type,
          created: n.created_at,
          read: n.read,
          recipientId: n.recipient_id
        })),
        countsByType,
        errors: notifError?.message
      },
      teamsIntegration: {
        linkedUsersCount: teamsLinks?.length || 0,
        linkedUsers: teamsLinks?.map(t => ({
          userId: t.user_id,
          teamsUserId: t.teams_user_id,
          linkedAt: t.created_at
        })),
        errors: teamsError?.message
      },
      dataToNotify: {
        expiringDocuments: {
          count: expiringDocs?.length || 0,
          sample: expiringDocs?.slice(0, 3),
          errors: docsError?.message
        },
        completedCourses: {
          count: completedCourses?.length || 0,
          sample: completedCourses?.slice(0, 3),
          errors: coursesError?.message
        },
        completedAuthorizations: {
          count: completedAuths?.length || 0,
          sample: completedAuths?.slice(0, 3),
          errors: authsError?.message
        }
      },
      adminUsers: {
        count: adminUserIds.length,
        ids: adminUserIds.slice(0, 5)
      },
      endpointsHealth: endpointsStatus,
      recommendations: []
    };
    
    // Add recommendations based on findings
    if (debugInfo.environment.missingVars.length > 0) {
      debugInfo.recommendations.push(`⚠️ Missing environment variables: ${debugInfo.environment.missingVars.join(', ')}`);
    }
    
    if (debugInfo.notifications.recentCount === 0) {
      debugInfo.recommendations.push("⚠️ No notifications created in the last 24 hours - cron job may not be running correctly");
    }
    
    if (debugInfo.teamsIntegration.linkedUsersCount === 0) {
      debugInfo.recommendations.push("⚠️ No Teams users linked - Teams notifications will not be sent");
    }
    
    if (debugInfo.dataToNotify.expiringDocuments.count > 0 && debugInfo.notifications.recentCount === 0) {
      debugInfo.recommendations.push("⚠️ There are expiring documents but no recent notifications - notification creation may be failing");
    }
    
    if (!envCheck.MICROSOFT_APP_ID || !envCheck.MICROSOFT_APP_PASSWORD) {
      debugInfo.recommendations.push("⚠️ Teams bot credentials not configured - Teams messages cannot be sent");
    }
    
    if (!envCheck.CRON_SECRET) {
      debugInfo.recommendations.push("⚠️ CRON_SECRET not set - cron job authentication may fail");
    }
    
    return NextResponse.json(debugInfo, { status: 200 });
    
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return NextResponse.json({ 
      error: "Failed to debug notification system",
      details: error.message 
    }, { status: 500 });
  }
}

// POST method to actually trigger notifications for testing
export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // Allow both CRON_SECRET and admin check for testing
    const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}`;
    
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Trigger all notification endpoints
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    const results = {};
    
    // Run each notification endpoint
    const endpoints = [
      { name: "document-expiry", path: "/api/notifications/document-expiry" },
      { name: "authorization-expiry", path: "/api/notifications/authorization-expiry" },
      { name: "retake-reminders", path: "/api/notifications/retake-reminders" },
      { name: "daily-admin-report", path: "/api/notifications/daily-admin-report" }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint.path}`, {
          method: 'POST',
          headers: {
            'authorization': authHeader || '',
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        results[endpoint.name] = {
          status: response.status,
          ok: response.ok,
          data
        };
      } catch (error) {
        results[endpoint.name] = {
          status: 'error',
          error: error.message
        };
      }
    }
    
    return NextResponse.json({
      message: "Test notifications triggered",
      timestamp: new Date().toISOString(),
      results
    });
    
  } catch (error) {
    console.error("Test trigger error:", error);
    return NextResponse.json({ 
      error: "Failed to trigger test notifications",
      details: error.message 
    }, { status: 500 });
  }
}