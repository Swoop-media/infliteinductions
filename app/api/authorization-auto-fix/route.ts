// @ts-nocheck
// Scheduled safety-net sweep that automatically fixes stuck authorisation
// assignments (status doesn't match actual course completion progress).
// Called by the cron hub (/api/notifications/run-all) or manually by an admin.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { runAuthorizationAutoFixSweep } from "@/lib/authorizations/auto-fix";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "This endpoint accepts POST requests to run the authorisation auto-fix sweep",
    usage: "Send a POST request with Authorization: Bearer CRON_SECRET, or as a logged-in Admin/Senior Management user",
  });
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  // 1) Cron secret (scheduled runs)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // 2) Logged-in Admin / Senior Management (manual runs)
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;

    const { data: hasAdminRole } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin",
    });
    if (hasAdminRole) return true;

    const { data: hasSeniorRole } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Senior Management",
    });
    return !!hasSeniorRole;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runAuthorizationAutoFixSweep();

    return NextResponse.json({
      success: result.errors.length === 0,
      message: `Auto-fix sweep complete: ${result.fixed.length} of ${result.checked} authorisation assignments corrected`,
      summary: {
        checked: result.checked,
        fixed: result.fixed.length,
        toPendingApproval: result.fixed.filter((f) => f.toStatus === "pending_approval").length,
        toInProgress: result.fixed.filter((f) => f.toStatus === "in_progress").length,
      },
      fixes: result.fixed,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Authorization auto-fix sweep error:", error);
    return NextResponse.json(
      { error: "Failed to run authorisation auto-fix sweep", details: error.message },
      { status: 500 }
    );
  }
}
