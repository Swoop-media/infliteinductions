// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";

function calculateDaysUntilExpiry(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function chunkedIn(supabase: any, table: string, select: string, field: string, ids: string[], extraFilters?: (q: any) => any) {
  const CHUNK_SIZE = 200;
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    let query = supabase.from(table).select(select).in(field, chunk);
    if (extraFilters) query = extraFilters(query);
    const { data } = await query;
    if (data) results.push(...data);
  }
  return results;
}

async function fetchAuthorisationDueDates(supabase: any) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 730);

  const { data: assignments, error } = await supabase
    .from("authorisation_assignments")
    .select("id, user_id, authorisation_id, approved_at")
    .eq("assignment_status", "completed")
    .not("approved_at", "is", null)
    .gte("approved_at", cutoffDate.toISOString());

  if (error || !assignments || assignments.length === 0) return [];

  const authIds = [...new Set(assignments.map((a: any) => a.authorisation_id))];
  const userIds = [...new Set(assignments.map((a: any) => a.user_id))];

  const [authorisations, profiles, authCourses] = await Promise.all([
    chunkedIn(supabase, "authorisations", "id, title, valid_for_days, department", "id", authIds),
    chunkedIn(supabase, "profiles", "id, full_name, email", "id", userIds),
    chunkedIn(supabase, "authorisation_courses", "authorisation_id, course_id", "authorisation_id", authIds),
  ]);

  const authMap = new Map(authorisations.map((a: any) => [a.id, a]));
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

  const authCourseMap = new Map<string, string[]>();
  authCourses.forEach((ac: any) => {
    const existing = authCourseMap.get(ac.authorisation_id) || [];
    existing.push(ac.course_id);
    authCourseMap.set(ac.authorisation_id, existing);
  });

  const allCourseIds = [...new Set(authCourses.map((ac: any) => ac.course_id))];

  let documents: any[] = [];
  let courseAssignmentsData: any[] = [];
  let courses: any[] = [];

  if (allCourseIds.length > 0 && userIds.length > 0) {
    [documents, courseAssignmentsData, courses] = await Promise.all([
      chunkedIn(supabase, "learner_documents", "id, user_id, course_id, expires_on", "user_id", userIds, (q: any) => q.in("course_id", allCourseIds).not("expires_on", "is", null)),
      chunkedIn(supabase, "course_assignments", "id, user_id, course_id, completed_at", "user_id", userIds, (q: any) => q.in("course_id", allCourseIds).eq("role", "trainee").not("completed_at", "is", null)),
      chunkedIn(supabase, "courses", "id, valid_for_months", "id", allCourseIds),
    ]);
  }

  const userCourseDocMap = new Map<string, any[]>();
  documents.forEach((doc: any) => {
    const key = `${doc.user_id}_${doc.course_id}`;
    const existing = userCourseDocMap.get(key) || [];
    existing.push(doc);
    userCourseDocMap.set(key, existing);
  });

  const courseValidityMap = new Map<string, number | null>();
  courses.forEach((c: any) => {
    courseValidityMap.set(c.id, c.valid_for_months);
  });

  const userCourseAssignmentMap = new Map<string, any>();
  courseAssignmentsData.forEach((ca: any) => {
    const key = `${ca.user_id}_${ca.course_id}`;
    userCourseAssignmentMap.set(key, ca);
  });

  const results: any[] = [];

  for (const assignment of assignments) {
    const auth = authMap.get(assignment.authorisation_id);
    const profile = profileMap.get(assignment.user_id);
    const approvedAt = new Date(assignment.approved_at);
    const validForDays = auth?.valid_for_days ?? null;

    const courseIds = authCourseMap.get(assignment.authorisation_id) || [];
    const userDocs: any[] = [];
    const userCourses: any[] = [];

    courseIds.forEach((courseId: string) => {
      const docKey = `${assignment.user_id}_${courseId}`;
      const docs = userCourseDocMap.get(docKey) || [];
      userDocs.push(...docs);

      const validForMonths = courseValidityMap.get(courseId);
      const courseAssignment = userCourseAssignmentMap.get(docKey);
      if (validForMonths && courseAssignment?.completed_at) {
        userCourses.push({
          valid_for_months: validForMonths,
          completed_at: courseAssignment.completed_at,
        });
      }
    });

    const expiryDate = calculateAuthorizationExpiry(
      approvedAt,
      validForDays,
      userDocs.map((d: any) => ({ expires_on: d.expires_on })),
      userCourses
    );

    if (!expiryDate) continue;

    const daysUntilExpiry = calculateDaysUntilExpiry(expiryDate);

    if (daysUntilExpiry > 60) continue;

    results.push({
      user_id: assignment.user_id,
      user_name: profile?.full_name || profile?.email || "Unknown",
      authorisation_title: auth?.title || "Unknown Authorisation",
      due_date: expiryDate,
      days_until_expiry: daysUntilExpiry,
    });
  }

  return results.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
}

function buildSummaryMessage(expired: any[], due7: any[], due30: any[], due60: any[], totalItems: number): string {
  const today = new Date().toLocaleDateString("en-NZ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let message = `📋 **Daily Authorisation Expiry Summary**\n`;
  message += `📅 ${today}\n\n`;

  if (totalItems === 0) {
    message += `No authorisations due within 60 days.\n\n`;
  } else {
    if (expired.length > 0) {
      message += `🔴 **Expired** (${expired.length})\n`;
      for (const item of expired.slice(0, 15)) {
        const daysText = item.days_until_expiry === 0
          ? "expires today"
          : `overdue by ${Math.abs(item.days_until_expiry)} days`;
        message += `• ${item.authorisation_title} - ${item.user_name} (${daysText})\n`;
      }
      if (expired.length > 15) message += `• ... and ${expired.length - 15} more\n`;
      message += `\n`;
    }

    if (due7.length > 0) {
      message += `🟡 **Due within 7 days** (${due7.length})\n`;
      for (const item of due7.slice(0, 15)) {
        message += `• ${item.authorisation_title} - ${item.user_name} (${item.days_until_expiry} days)\n`;
      }
      if (due7.length > 15) message += `• ... and ${due7.length - 15} more\n`;
      message += `\n`;
    }

    if (due30.length > 0) {
      message += `🟠 **Due within 30 days** (${due30.length})\n`;
      for (const item of due30.slice(0, 15)) {
        message += `• ${item.authorisation_title} - ${item.user_name} (${item.days_until_expiry} days)\n`;
      }
      if (due30.length > 15) message += `• ... and ${due30.length - 15} more\n`;
      message += `\n`;
    }

    if (due60.length > 0) {
      message += `🔵 **Due within 60 days** (${due60.length})\n`;
      for (const item of due60.slice(0, 15)) {
        message += `• ${item.authorisation_title} - ${item.user_name} (${item.days_until_expiry} days)\n`;
      }
      if (due60.length > 15) message += `• ... and ${due60.length - 15} more\n`;
      message += `\n`;
    }
  }

  message += `View full reports: https://training.inflite.nz/app/admin`;
  return message;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const isScheduledTask = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isScheduledTask) {
      const isAdmin = await hasRole("Admin");
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = supabaseAdmin();

    const [
      { data: roles, error: roleError },
      allAuthorisations,
    ] = await Promise.all([
      supabase.from("roles").select("id, name").in("name", ["Admin", "Senior Management"]),
      fetchAuthorisationDueDates(supabase),
    ]);

    if (roleError || !roles || roles.length === 0) {
      return NextResponse.json({
        error: "Required roles not found",
        details: roleError?.message,
      }, { status: 404 });
    }

    const roleIds = roles.map((r) => r.id);

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role_id", roleIds);

    if (!userRoles || userRoles.length === 0) {
      return NextResponse.json({
        error: "No users found with Admin or Senior Management roles",
      }, { status: 404 });
    }

    const uniqueUserIds = [...new Set(userRoles.map((ur) => ur.user_id))];

    const { data: recipientUsers } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", uniqueUserIds);

    if (!recipientUsers || recipientUsers.length === 0) {
      return NextResponse.json({
        error: "No recipient users found",
      }, { status: 404 });
    }

    const expired = allAuthorisations.filter((a) => a.days_until_expiry <= 0);
    const due7 = allAuthorisations.filter((a) => a.days_until_expiry > 0 && a.days_until_expiry <= 7);
    const due30 = allAuthorisations.filter((a) => a.days_until_expiry > 7 && a.days_until_expiry <= 30);
    const due60 = allAuthorisations.filter((a) => a.days_until_expiry > 30 && a.days_until_expiry <= 60);

    const totalItems = expired.length + due7.length + due30.length + due60.length;

    const message = buildSummaryMessage(expired, due7, due30, due60, totalItems);

    const sendResults = await Promise.allSettled(
      recipientUsers.map(async (recipient) => {
        await sendTeamsDMToAppUser(recipient.id, message);
        return {
          userId: recipient.id,
          userName: recipient.full_name || recipient.email,
          status: "success",
          itemsFound: totalItems,
        };
      })
    );

    const results = sendResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const recipient = recipientUsers[index];
      console.error(`Failed to send to user ${recipient.id}:`, result.reason);
      return {
        userId: recipient.id,
        userName: recipient.full_name || recipient.email,
        status: "failed",
        error: result.reason?.message || "Unknown error",
      };
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        recipientsNotified: recipientUsers.length,
        expired: expired.length,
        due7Days: due7.length,
        due30Days: due30.length,
        due60Days: due60.length,
        totalItems,
      },
      results,
    });
  } catch (error) {
    console.error("Error sending daily admin summaries:", error);
    return NextResponse.json({
      error: "Failed to send daily summaries",
      details: error.message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "/api/admin/send-daily-summaries",
    description: "Daily authorisation expiry summary endpoint",
  });
}
