
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

    // First, let's check what data we have
    const { data: assignments, error: assignmentsError } = await supabase
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        completed_at,
        assignment_status,
        courses!inner(
          title,
          valid_for_days,
          retake_reminder_days
        )
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null);

    console.log("Found assignments:", assignments?.length || 0);
    if (assignments) {
      for (const assignment of assignments) {
        // Explicit type annotation to prevent type inference issues
        const course = (assignment as any).courses as { 
          title: string; 
          valid_for_days: number; 
          retake_reminder_days: number 
        };
        if (course.valid_for_days && course.retake_reminder_days) {
          const completedDate = new Date(assignment.completed_at);
          const dueDate = new Date(completedDate);
          dueDate.setDate(dueDate.getDate() + course.valid_for_days);
          const daysUntilExpiry = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          
          console.log(`Assignment ${assignment.id}:`, {
            course: course.title,
            completedAt: assignment.completed_at,
            dueDate: dueDate.toISOString().split('T')[0],
            daysUntilExpiry,
            validForDays: course.valid_for_days,
            reminderDays: course.retake_reminder_days,
            shouldNotify: daysUntilExpiry > 0 && daysUntilExpiry <= course.retake_reminder_days
          });
        }
      }
    }

    const [reminderResult, expiredResult] = await Promise.all([
      supabase.rpc("send_course_expiry_reminders"),
      supabase.rpc("send_expired_course_notifications")
    ]);

    console.log("Reminder result:", reminderResult);
    console.log("Expired result:", expiredResult);

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
      expiredResult: expiredResult.error ? { error: expiredResult.error.message } : { success: true },
      debug: {
        assignmentsFound: assignments?.length || 0,
        assignments: assignments?.map(a => ({
          id: a.id,
          course: (a.courses as any)?.title,
          completed: a.completed_at,
          validDays: (a.courses as any)?.valid_for_days,
          reminderDays: (a.courses as any)?.retake_reminder_days
        })) || []
      }
    });

  } catch (error) {
    console.error("Error in send-expiry-reminders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
