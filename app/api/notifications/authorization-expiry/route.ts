// @ts-nocheck
// API endpoint to check for authorization expiry and send notifications
// Should be called daily by a cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";

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
    today.setHours(0, 0, 0, 0);

    const { data: assignments, error } = await supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status,
        completed_at
      `)
      .eq("assignment_status", "completed")
      .not("completed_at", "is", null);
    
    if (error) {
      console.error("Error fetching authorization assignments:", error);
      return NextResponse.json({ 
        error: "Failed to fetch authorization assignments",
        details: error.message 
      }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ 
        success: true,
        summary: { totalAssignments: 0, notificationsExpired: 0, notificationsRetakeReminder: 0 }
      });
    }

    const authIds = [...new Set(assignments.map(a => a.authorisation_id))];
    const { data: authorisations } = await supabase
      .from("authorisations")
      .select("id, title, valid_for_days, retake_reminder_days")
      .in("id", authIds);
    
    const authMap = new Map(authorisations?.map(a => [a.id, a]) || []);
    
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const { data: authCourses } = await supabase
      .from("authorisation_courses")
      .select("authorisation_id, course_id")
      .in("authorisation_id", authIds);

    const authCourseMap = new Map<string, string[]>();
    (authCourses || []).forEach((ac: any) => {
      const existing = authCourseMap.get(ac.authorisation_id) || [];
      existing.push(ac.course_id);
      authCourseMap.set(ac.authorisation_id, existing);
    });

    const allCourseIds = [...new Set((authCourses || []).map((ac: any) => ac.course_id))];

    let documents: any[] = [];
    if (allCourseIds.length > 0 && userIds.length > 0) {
      const { data: docs } = await supabase
        .from("learner_documents")
        .select("id, user_id, course_id, expires_on")
        .in("user_id", userIds)
        .in("course_id", allCourseIds)
        .not("expires_on", "is", null);
      documents = docs || [];
    }

    const userCourseDocMap = new Map<string, any[]>();
    documents.forEach((doc: any) => {
      const key = `${doc.user_id}_${doc.course_id}`;
      const existing = userCourseDocMap.get(key) || [];
      existing.push(doc);
      userCourseDocMap.set(key, existing);
    });

    const { data: courses } = await supabase
      .from("courses")
      .select("id, valid_for_months")
      .in("id", allCourseIds);

    const courseValidityMap = new Map<string, number | null>();
    (courses || []).forEach((c: any) => {
      courseValidityMap.set(c.id, c.valid_for_months);
    });

    let courseAssignmentsData: any[] = [];
    if (allCourseIds.length > 0 && userIds.length > 0) {
      const { data: caData } = await supabase
        .from("course_assignments")
        .select("id, user_id, course_id, completed_at")
        .in("user_id", userIds)
        .in("course_id", allCourseIds)
        .eq("role", "trainee")
        .not("completed_at", "is", null);
      courseAssignmentsData = caData || [];
    }

    const userCourseAssignmentMap = new Map<string, any>();
    courseAssignmentsData.forEach((ca: any) => {
      const key = `${ca.user_id}_${ca.course_id}`;
      userCourseAssignmentMap.set(key, ca);
    });

    let notificationsExpired = 0;
    let notificationsRetakeReminder = 0;

    for (const assignment of assignments) {
      const auth = authMap.get(assignment.authorisation_id);
      
      if (!auth) continue;
      
      const completedDate = new Date(assignment.completed_at);
      
      const courseIds = authCourseMap.get(assignment.authorisation_id) || [];
      const userDocs: any[] = [];
      const userCourses: any[] = [];
      
      courseIds.forEach(courseId => {
        const key = `${assignment.user_id}_${courseId}`;
        const docs = userCourseDocMap.get(key) || [];
        userDocs.push(...docs);
        
        const validForMonths = courseValidityMap.get(courseId);
        const courseAssignment = userCourseAssignmentMap.get(key);
        if (validForMonths && courseAssignment?.completed_at) {
          userCourses.push({
            valid_for_months: validForMonths,
            completed_at: courseAssignment.completed_at
          });
        }
      });

      const expiryDate = calculateAuthorizationExpiry(
        completedDate,
        auth.valid_for_days,
        userDocs.map(d => ({ expires_on: d.expires_on })),
        userCourses
      );

      if (!expiryDate) continue;
      
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const formattedExpiryDate = expiryDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const profile = profileMap.get(assignment.user_id);
      const authTitle = auth.title || "Authorization";
      const retakeReminderDays = auth.retake_reminder_days || 30;

      if (daysUntilExpiry <= 0) {
        await notifyUser(
          assignment.user_id,
          "authorization_expired",
          {
            authorizationTitle: authTitle,
            authorizationId: assignment.authorisation_id,
            expiredDate: formattedExpiryDate,
            daysOverdue: Math.abs(daysUntilExpiry),
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `auth_expired_${assignment.id}_${today.toISOString().split('T')[0]}`,
            skipTeams: false 
          }
        );
        notificationsExpired++;

        await supabase
          .from("authorisation_assignments")
          .update({ assignment_status: "expired" })
          .eq("id", assignment.id);
      } 
      else if (daysUntilExpiry === 60 && retakeReminderDays !== 60) {
        await notifyUser(
          assignment.user_id,
          "retake_reminder",
          {
            type: "Authorization",
            itemTitle: authTitle,
            authorizationId: assignment.authorisation_id,
            daysUntilExpiry: daysUntilExpiry,
            expiryDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `auth_retake_reminder_${assignment.id}_60days`,
            skipTeams: false 
          }
        );
        notificationsRetakeReminder++;
      }
      else if (daysUntilExpiry === retakeReminderDays) {
        await notifyUser(
          assignment.user_id,
          "retake_reminder",
          {
            type: "Authorization",
            itemTitle: authTitle,
            authorizationId: assignment.authorisation_id,
            daysUntilExpiry: daysUntilExpiry,
            expiryDate: formattedExpiryDate,
            learnerName: profile?.full_name,
            learner_email: profile?.email,
            url: `/app/my-training`
          },
          { 
            eventId: `auth_retake_reminder_${assignment.id}_${retakeReminderDays}days`,
            skipTeams: false 
          }
        );
        notificationsRetakeReminder++;
      }
    }

    const summary = {
      totalAssignments: assignments?.length || 0,
      notificationsExpired,
      notificationsRetakeReminder,
      timestamp: new Date().toISOString()
    };

    console.log("Authorization expiry notifications sent:", summary);

    return NextResponse.json({ 
      success: true,
      summary
    });
    
  } catch (error: any) {
    console.error("Authorization expiry notification error:", error);
    return NextResponse.json({ 
      error: "Failed to process authorization expiry notifications",
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
