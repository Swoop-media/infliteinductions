// @ts-nocheck
// API endpoint to check for course retake reminders and send notifications
// Should be called daily by a cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";

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
    // Verify the request is authorized (could be from a cron job with a secret)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all completed course assignments 
    const { data: assignments, error } = await supabase
      .from("course_assignments")
      .select(`
        id,
        user_id,
        course_id,
        completed_at
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true });
    
    // Get courses separately
    const courseIds = [...new Set((assignments || []).map(a => a.course_id))];
    const { data: courses } = await supabase
      .from("courses")
      .select("id, title, valid_for_months, retake_reminder_days")
      .in("id", courseIds)
      .not("valid_for_months", "is", null);
    
    const courseMap = new Map(courses?.map(c => [c.id, c]) || []);
    
    // Get user profiles separately
    const userIds = [...new Set((assignments || []).map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    if (error) {
      console.error("Error fetching course assignments:", error);
      return NextResponse.json({ 
        error: "Failed to fetch course assignments",
        details: error.message 
      }, { status: 500 });
    }

    let notificationsRetake = 0;
    let notificationsExpired = 0;

    for (const assignment of assignments || []) {
      const course = courseMap.get(assignment.course_id);
      if (!course) continue;
      
      const completedDate = new Date(assignment.completed_at);
      const validForMonths = course.valid_for_months;
      const retakeReminderDays = course.retake_reminder_days || 30; // Default to 30 days
      
      if (!validForMonths) continue;
      
      // Calculate expiry date
      const expiryDate = new Date(completedDate);
      expiryDate.setMonth(expiryDate.getMonth() + validForMonths);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Format expiry date for display
      const formattedExpiryDate = expiryDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const courseTitle = course.title || "Course";
      const profile = profileMap.get(assignment.user_id);

      // Check if course has expired
      if (daysUntilExpiry <= 0) {
        // Send course expired notification
        await notifyUser(
          assignment.user_id,
          "course_expired",
          {
            courseTitle: courseTitle,
            courseId: assignment.course_id,
            daysOverdue: Math.abs(daysUntilExpiry),
            dueDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `course_expired_${assignment.id}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsExpired++;
      } 
      // Check if we should send a retake reminder
      else if (daysUntilExpiry === retakeReminderDays) {
        // Send retake reminder notification
        await notifyUser(
          assignment.user_id,
          "retake_reminder",
          {
            type: "Course",
            itemTitle: courseTitle,
            courseId: assignment.course_id,
            daysUntilExpiry: daysUntilExpiry,
            expiryDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `course_retake_reminder_${assignment.id}_${retakeReminderDays}days`,
            skipTeams: false 
          }
        );
        notificationsRetake++;
      }
      // Also check for general course expiry reminders (different from retake reminder)
      else if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        // Send course expiry reminder
        await notifyUser(
          assignment.user_id,
          "course_expiry_reminder",
          {
            courseTitle: courseTitle,
            courseId: assignment.course_id,
            daysUntilExpiry: daysUntilExpiry,
            dueDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `course_expiry_reminder_${assignment.id}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
      }
    }

    const summary = {
      totalAssignments: assignments?.length || 0,
      notificationsRetake,
      notificationsExpired,
      timestamp: new Date().toISOString()
    };

    console.log("Retake reminder notifications sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Retake reminder notification error:", error);
    return NextResponse.json({ 
      error: "Failed to process retake reminder notifications",
      details: error.message 
    }, { status: 500 });
  }
}