// @ts-nocheck
// @ts-nocheck
// app/app/_actions/notifications.ts
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

// --- Optional Teams sender (if present). We load lazily and swallow errors if missing.
async function trySendTeamsDM(appUserId: string, text: string) {
  try {
    const mod = await import("@/lib/teams/send");
    if (typeof mod.sendTeamsDMToAppUser === "function") {
      await mod.sendTeamsDMToAppUser(appUserId, text);
    }
  } catch {
    // No teams module or sending failed — non-blocking by design.
  }
}

/**
 * Attempts to update using read_at; if the column doesn't exist,
 * falls back to is_read boolean.
 */
export async function markNotificationRead(formData: FormData) {
  const id = String(formData.get("notification_id") || "");
  if (!id) return;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Try read_at path
  const updateData: any = { read_at: new Date().toISOString() };
  let { error } = await supabase
    .from("notifications")
    .update(updateData)
    .eq("id", id)
    .eq("recipient_id", user.id);

  // If read_at column doesn't exist, fallback to is_read/read
  if (error && (error as any).code === "42703") {
    const fallbackData: any = { read: true };
    await supabase
      .from("notifications")
      .update(fallbackData)
      .eq("id", id)
      .eq("recipient_id", user.id);
  }

  // Revalidate current page
  const referer = (await headers()).get("referer") || "/app/home";
  try {
    const p = new URL(referer);
    revalidatePath(p.pathname);
  } catch {
    revalidatePath("/app/home");
  }
}

/** Mark all of the current user's notifications as read. */
export async function markAllNotificationsRead() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // First attempt: read_at column
  const updateData: any = { read_at: new Date().toISOString() };
  let { error } = await supabase
    .from("notifications")
    .update(updateData)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  // Fallback: boolean read
  if (error && (error as any).code === "42703") {
    const fallbackData: any = { read: true };
    await supabase
      .from("notifications")
      .update(fallbackData)
      .eq("recipient_id", user.id)
      .eq("read", false);
  }

  const referer = (await headers()).get("referer") || "/app/home";
  try {
    const p = new URL(referer);
    revalidatePath(p.pathname);
  } catch {
    revalidatePath("/app/home");
  }
}

/* -----------------------------------------------------------------------------
   Centralised creation (keeps all existing notifications intact)
----------------------------------------------------------------------------- */

const NotificationInput = z.object({
  /** auth.users.id of the recipient */
  recipientUserId: z.string().uuid(),
  /** e.g. "enrolment_request", "status_change" */
  type: z.string(),
  title: z.string().min(1),
  body: z.string().optional(),
  /** extra context stored as JSONB (courseId, moduleId, etc.) */
  data: z.record(z.any()).optional(),
  /** Try to send a Teams DM alongside the in-app notification (default true) */
  sendTeams: z.boolean().optional().default(true),
});
export type NotificationInput = z.infer<typeof NotificationInput>;

/** Small formatter so Teams DMs look nice; extend per type over time */
function teamsTextFor(n: NotificationInput) {
  switch (n.type) {
    case "enrolment_request":
      return [
        "📥 *Enrollment request*",
        n.data?.learnerName ? `• Learner: ${n.data.learnerName}` : "",
        n.data?.courseTitle ? `• Course: ${n.data.courseTitle}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "enrolment_approved":
      // Handle both regular enrolment approvals and course assignments
      const role = n.data?.role;
      const roleDisplay = n.data?.roleDisplayName || role;
      const emoji = role === "trainee" ? "📚" : 
                   role === "onsite_trainer" ? "👨‍🏫" : 
                   role === "onsite_assessor" ? "📋" : "📚";

      // If it's a course assignment (has role data), use assignment formatting
      if (role) {
        return [
          `${emoji} *${role === "trainee" ? "Course assigned" : `${roleDisplay} role assigned`}*`,
          n.data?.courseTitle ? `• Course: ${n.data.courseTitle}` : "",
          n.data?.assignedBy ? `• Assigned by: ${n.data.assignedBy}` : "",
          role && role !== "trainee" ? `• Role: ${roleDisplay}` : "",
          "",
          n.body || "",
          n.data?.url ? `🔗 ${role === "trainee" ? "Start learning" : "View course"}: ${n.data.url}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      // Default enrolment approved formatting
      return [
        "📚 *Enrolment approved*",
        n.data?.courseTitle ? `• Course: ${n.data.courseTitle}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_assigned":
      return [
        "🔑 *Authorization assigned*",
        n.data?.authorizationTitle ? `• Authorization: ${n.data.authorizationTitle}` : "",
        n.data?.assignedBy ? `• Assigned by: ${n.data.assignedBy}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_revoked":
      return [
        "⚠️ *Authorization revoked*",
        n.data?.authorizationTitle ? `• Authorization: ${n.data.authorizationTitle}` : "",
        n.data?.revokedBy ? `• Revoked by: ${n.data.revokedBy}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "role_granted":
      return [
        "👑 *Role granted*",
        n.data?.roleName ? `• Role: ${n.data.roleName}` : "",
        n.data?.grantedBy ? `• Granted by: ${n.data.grantedBy}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "role_revoked":
      return [
        "🚫 *Role revoked*",
        n.data?.roleName ? `• Role: ${n.data.roleName}` : "",
        n.data?.revokedBy ? `• Revoked by: ${n.data.revokedBy}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "enrolment_revoked":
      // Handle both regular enrolment revocations and assignment revocations
      const revokedRole = n.data?.roleDisplayName || n.data?.role;

      // If it's a role assignment revocation (has role data), use assignment formatting
      if (revokedRole) {
        return [
          "⚠️ *Course assignment revoked*",
          n.data?.courseTitle ? `• Course: ${n.data.courseTitle}` : "",
          revokedRole ? `• Role: ${revokedRole}` : "",
          n.data?.revokedBy ? `• Revoked by: ${n.data.revokedBy}` : "",
          "",
          n.body || "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      // Default enrolment revoked formatting
      return [
        "⚠️ *Enrolment revoked*",
        n.data?.courseTitle ? `• Course: ${n.data.courseTitle}` : "",
        "",
        n.body || "",
      ]
        .filter(Boolean)
        .join("\n");

    case "onsite_training_ready":
      const learnerInfo = n.data?.learnerName || n.data?.traineeName || n.data?.learner_email || "A learner";
      const course = n.data?.courseTitle;
      const url = n.data?.url;
      return [
        "🎯 Learner ready for onsite training",
        `• Learner: ${learnerInfo}`,
        course ? `• Course: ${course}` : "",
        url ? `• Train/Assess dashboard: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "onsite_assessment_ready":
      const assessmentLearnerInfo = n.data?.learnerName || n.data?.traineeName || n.data?.learner_email || "A learner";
      const assessmentCourse = n.data?.courseTitle;
      const assessmentUrl = n.data?.url;
      return [
        "📋 Learner ready for onsite assessment",
        `• Learner: ${assessmentLearnerInfo}`,
        assessmentCourse ? `• Course: ${assessmentCourse}` : "",
        assessmentUrl ? `• Train/Assess dashboard: ${assessmentUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_completed":
      const completedLearnerInfo = n.data?.learnerName || n.data?.traineeName || n.data?.learner_email || "A learner";
      const completedCourse = n.data?.courseTitle;
      const completedUrl = n.data?.url;
      return [
        "🏆 Course completed",
        `• Learner: ${completedLearnerInfo}`,
        completedCourse ? `• Course: ${completedCourse}` : "",
        completedUrl ? `• View certificate: ${completedUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    default:
      return `🔔 ${n.title}${n.body ? `\n\n${n.body}` : ""}`;
  }
}

/**
 * Create an in-app notification, then (best-effort) send the same as a Teams DM.
 * This does NOT delete/alter existing rows — it only inserts a new one.
 */
export async function createNotification(input: NotificationInput) {
  const n = NotificationInput.parse(input);
  const supabase = await createSupabaseServer();

  // 1) Persist the in-app notification - try new schema first, fallback to old schema
  let data: any;
  let error: any;

  // Try old schema with recipient_id and payload first (based on your table structure)
  ({ data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: n.recipientUserId,
      type: n.type,
      payload: {
        title: n.title,
        body: n.body ?? null,
        ...n.data ?? {},
      },
      read: false,
    })
    .select("id")
    .single());

  // If that fails due to missing columns, try new schema with user_id, title, body columns
  if (error && (error.code === "42703" || error.message.includes("Could not find") || error.message.includes("column"))) {
    ({ data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: n.recipientUserId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        data: n.data ?? null,
      })
      .select("id")
      .single());
  }

  if (error) {
    // If it's a duplicate notification (unique constraint violation), that's fine - just return success
    if (error.code === "23505") {
      console.log(`Duplicate notification detected (event already exists), skipping: ${error.message}`);
      return { id: "duplicate", skipped: true };
    }
    throw new Error(`Failed to save notification: ${error.message}`);
  }

  // 2) Best-effort Teams DM (non-blocking; never deletes/updates existing notifications)
  if (n.sendTeams) {
    // ✅ Feature flag: Disable course publishing Teams notifications
    const DISABLE_COURSE_PUBLISH_NOTIFICATIONS = process.env.DISABLE_COURSE_PUBLISH_NOTIFICATIONS === 'true';
    if (n.type === 'course_published' && DISABLE_COURSE_PUBLISH_NOTIFICATIONS) {
      console.log('🔕 Course publishing Teams notifications are disabled via feature flag');
    } else {
      try {
        await trySendTeamsDM(n.recipientUserId, teamsTextFor(n));
      } catch {
        // intentionally ignored; in-app is the source of truth
      }
    }
  }

  return { id: data.id as string };
}