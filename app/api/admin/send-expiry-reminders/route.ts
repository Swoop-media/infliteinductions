
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has admin role
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select(`
        roles!inner(name)
      `)
      .eq("user_id", user.id);

    const isAdmin = userRoles?.some(ur => 
      (ur as any).roles?.name?.toLowerCase() === "admin"
    );

    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Call the SQL functions to send reminders
    console.log("Triggering expiry reminder checks...");

    const [reminderResult, expiredResult] = await Promise.all([
      supabase.rpc("send_course_expiry_reminders"),
      supabase.rpc("send_expired_course_notifications")
    ]);

    if (reminderResult.error) {
      console.error("Error sending expiry reminders:", reminderResult.error);
    }

    if (expiredResult.error) {
      console.error("Error sending expired notifications:", expiredResult.error);
    }

    return NextResponse.json({
      success: true,
      message: "Expiry reminder check completed",
      reminderResult: reminderResult.error ? { error: reminderResult.error.message } : { success: true },
      expiredResult: expiredResult.error ? { error: expiredResult.error.message } : { success: true }
    });

  } catch (error) {
    console.error("Error in send-expiry-reminders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
