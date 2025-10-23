// @ts-nocheck
// lib/notifications/dispatcher.ts
import { createClient } from "@supabase/supabase-js";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";
import { toAbsoluteUrl } from "@/lib/utils/url";

function supabaseAdmin() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!url || !key)
    throw new Error(
      "Supabase admin env not set (SUPABASE_URL + SERVICE_ROLE_KEY)."
    );
  return createClient(url, key, { auth: { persistSession: false } });
}

export type NotificationType =
  | "enrolment_request" // OBSOLETE - kept for backwards compatibility
  | "enrolment_approved" // OBSOLETE - kept for backwards compatibility
  | "enrolment_revoked" // OBSOLETE - kept for backwards compatibility
  | "course_assigned"
  | "course_updated"
  | "authorization_assigned"
  | "authorization_approved"
  | "authorization_revoked"
  | "authorization_expired"
  | "authorization_published"
  | "authorisation_pending_approval"
  | "role_granted"
  | "role_revoked"
  | "status_change"
  | "quiz_passed"
  | "module_rejected"
  | "retake_reminder"
  | "document_expiry_30"
  | "document_expiry_10"
  | "document_expiry_daily"
  | "daily_auth_expiry_report"
  | "daily_doc_expiry_report"
  | "onsite_training_ready"
  | "onsite_assessment_ready"
  | "course_completed"
  | "course_expiry_reminder"
  | "course_expired"
  | "issue_report"
  | string;

function formatTeamsText(
  type: string,
  payload: any,
  fallbackTitle?: string
): string {
  const title = payload?.title || fallbackTitle || "Notification";
  const learner = payload?.learnerName || payload?.learner_email || "";
  const course = payload?.courseTitle || payload?.course_title || payload?.course_name || "";
  // Normalize URL to absolute production URL for Teams messages
  const rawUrl = payload?.url as string | undefined;
  const url = rawUrl ? toAbsoluteUrl(rawUrl) : undefined;

  switch (type) {
    case "enrolment_request":
      return [
        "📥 Enrollment request",
        learner ? `• Learner: ${learner}` : "",
        course ? `• Course: ${course}` : "",
        url ? `• Link: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "enrolment_approved":
      return [
        "✅ Enrolment approved",
        course ? `• Course: ${course}` : "",
        url ? `• Start here: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "enrolment_revoked":
      return [
        "⚠️ Enrolment revoked",
        course ? `• Course: ${course}` : "",
        url ? `• Details: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "quiz_passed":
      return [
        "🎉 Quiz passed",
        course ? `• Course: ${course}` : "",
        payload?.score ? `• Score: ${payload.score}%` : "",
        url ? `• View results: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "onsite_training_ready":
      return [
        "🎯 Learner ready for onsite training",
        learner ? `• Learner: ${learner}` : "",
        course ? `• Course: ${course}` : "",
        url ? `• Train/Assess dashboard: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "onsite_assessment_ready":
      return [
        "📋 Learner ready for onsite assessment",
        learner ? `• Learner: ${learner}` : "",
        course ? `• Course: ${course}` : "",
        url ? `• Train/Assess dashboard: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_completed":
      return [
        "🏆 Course completed",
        learner ? `• Learner: ${learner}` : "",
        course ? `• Course: ${course}` : "",
        url ? `• View certificate: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_expiry_reminder":
      const daysLeft = payload?.daysUntilExpiry || 0;
      return [
        `⏰ Course expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        course ? `• Course: ${course}` : "",
        payload?.dueDate ? `• Due date: ${payload.dueDate}` : "",
        url ? `• Retake now: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_expired":
      const daysOverdue = payload?.daysOverdue || 0;
      return [
        `🚨 Course expired ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago`,
        course ? `• Course: ${course}` : "",
        payload?.dueDate ? `• Was due: ${payload.dueDate}` : "",
        url ? `• Retake now: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "issue_report":
      return [
        "🚨 Issue reported",
        payload?.reporter_name ? `• Reporter: ${payload.reporter_name}` : "",
        payload?.reporter_email ? `• Email: ${payload.reporter_email}` : "",
        payload?.message ? `• Message: ${payload.message}` : "",
        payload?.attachments_count > 0 ? `• Attachments: ${payload.attachments_count}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_assigned":
      return [
        "📚 Course assigned",
        course ? `• Course: ${course}` : "",
        payload?.assignedBy ? `• Assigned by: ${payload.assignedBy}` : "",
        url ? `• Start learning: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "course_updated":
      return [
        "🔄 Course updated - Resit required",
        course ? `• Course: ${course}` : "",
        payload?.senderName ? `• Updated by: ${payload.senderName}` : "",
        "• The course content has changed and you need to complete it again",
        url ? `• Start resit: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_assigned":
      return [
        "🔑 Authorization assigned",
        payload?.authorizationTitle ? `• Authorization: ${payload.authorizationTitle}` : "",
        payload?.assignedBy ? `• Assigned by: ${payload.assignedBy}` : "",
        url ? `• View details: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_revoked":
      return [
        "⚠️ Authorization revoked",
        payload?.authorizationTitle ? `• Authorization: ${payload.authorizationTitle}` : "",
        payload?.revokedBy ? `• Revoked by: ${payload.revokedBy}` : "",
        payload?.reason ? `• Reason: ${payload.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorisation_pending_approval":
      return [
        "📋 Authorisation pending approval",
        learner ? `• Learner: ${learner}` : "",
        payload?.authorizationTitle ? `• Authorisation: ${payload.authorizationTitle}` : "",
        url ? `• Review: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_approved":
      return [
        "✅ Authorisation approved!",
        payload?.authorizationTitle ? `• Authorisation: ${payload.authorizationTitle}` : "",
        payload?.approvedBy ? `• Approved by: ${payload.approvedBy}` : "",
        payload?.validFor ? `• Valid for: ${payload.validFor} days` : "",
        url ? `• View details: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "role_granted":
      return [
        "👑 Role granted",
        payload?.roleName ? `• Role: ${payload.roleName}` : "",
        payload?.grantedBy ? `• Granted by: ${payload.grantedBy}` : "",
        url ? `• View permissions: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "role_revoked":
      return [
        "🚫 Role revoked",
        payload?.roleName ? `• Role: ${payload.roleName}` : "",
        payload?.revokedBy ? `• Revoked by: ${payload.revokedBy}` : "",
        payload?.reason ? `• Reason: ${payload.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "module_rejected":
      // Different message for assessors vs trainees
      if (payload?.isAssessorNotification) {
        return [
          "❌ Module rejected - Trainee needs to resit",
          payload?.learnerName ? `• Trainee: ${payload.learnerName}` : "",
          payload?.moduleTitle ? `• Module: ${payload.moduleTitle}` : "",
          payload?.courseTitle ? `• Course: ${payload.courseTitle}` : "",
          payload?.rejectedBy ? `• Rejected by: ${payload.rejectedBy}` : "",
          payload?.rejectionReason ? `• Reason: ${payload.rejectionReason}` : "",
          "",
          "ℹ️ The trainee will need to complete this module again.",
          url ? `• Train/Assess dashboard: ${url}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      } else {
        return [
          "❌ Module rejected - Resit required",
          payload?.moduleTitle ? `• Module: ${payload.moduleTitle}` : "",
          payload?.courseTitle ? `• Course: ${payload.courseTitle}` : "",
          payload?.rejectedBy ? `• Rejected by: ${payload.rejectedBy}` : "",
          payload?.rejectionReason ? `• Reason: ${payload.rejectionReason}` : "",
          "",
          "⚠️ You need to complete this module again.",
          url ? `• Complete module: ${url}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

    case "authorization_expired":
      return [
        "⚠️ Authorization expired",
        payload?.authorizationTitle ? `• Authorization: ${payload.authorizationTitle}` : "",
        payload?.expiredDate ? `• Expired on: ${payload.expiredDate}` : "",
        payload?.daysOverdue ? `• Days overdue: ${payload.daysOverdue}` : "",
        url ? `• Retake authorization: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "authorization_published":
      return [
        "📢 Authorization published",
        payload?.authorizationTitle ? `• Authorization: ${payload.authorizationTitle}` : "",
        payload?.publishedBy ? `• Published by: ${payload.publishedBy}` : "",
        url ? `• View authorization: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "retake_reminder":
      const type_label = payload?.type || "Item";
      const days_until = payload?.daysUntilExpiry || 0;
      return [
        `⏰ Retake reminder - ${type_label} expiring soon`,
        payload?.itemTitle ? `• ${type_label}: ${payload.itemTitle}` : "",
        `• Expires in ${days_until} day${days_until !== 1 ? 's' : ''}`,
        payload?.expiryDate ? `• Expiry date: ${payload.expiryDate}` : "",
        url ? `• Retake now: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "document_expiry_30":
      return [
        "📄 Document expiring in 30 days",
        payload?.documentName ? `• Document: ${payload.documentName}` : "",
        payload?.expiryDate ? `• Expires on: ${payload.expiryDate}` : "",
        learner ? `• For: ${learner}` : "",
        url ? `• Upload replacement: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "document_expiry_10":
      return [
        "⚠️ Document expiring in 10 days",
        payload?.documentName ? `• Document: ${payload.documentName}` : "",
        payload?.expiryDate ? `• Expires on: ${payload.expiryDate}` : "",
        learner ? `• For: ${learner}` : "",
        url ? `• Upload replacement urgently: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "document_expiry_daily":
      const daysRemaining = payload?.daysUntilExpiry || 0;
      const urgency = daysRemaining <= 0 ? "🚨 Document EXPIRED" : `🚨 Document expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
      return [
        urgency,
        payload?.documentName ? `• Document: ${payload.documentName}` : "",
        payload?.expiryDate ? `• Expiry date: ${payload.expiryDate}` : "",
        learner ? `• For: ${learner}` : "",
        url ? `• Upload replacement NOW: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "daily_auth_expiry_report":
      const authCount = payload?.count || 0;
      // Handle summary as array or string - use double newlines for Teams formatting
      const authSummary = Array.isArray(payload?.summary) 
        ? payload.summary.join("\n\n") 
        : payload?.summary || "";
      return [
        "📊 Daily Authorization Expiry Report",
        `• Total expiring soon: ${authCount} authorization${authCount !== 1 ? 's' : ''}`,
        authSummary ? `• Summary:\n\n${authSummary}` : "",
        url ? `• View full report: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

    case "daily_doc_expiry_report":
      const docCount = payload?.count || 0;
      // Handle summary as array or string - use double newlines for Teams formatting
      const docSummary = Array.isArray(payload?.summary) 
        ? payload.summary.join("\n\n") 
        : payload?.summary || "";
      return [
        "📊 Daily Document Expiry Report", 
        `• Total expiring soon: ${docCount} document${docCount !== 1 ? 's' : ''}`,
        docSummary ? `• Summary:\n\n${docSummary}` : "",
        url ? `• View full report: ${url}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

    default:
      return `🔔 ${title}`;
  }
}

type NotifyOpts = {
  /** Optional idempotency key; we’ll store as payload.event_id and rely on a unique index to prevent dupes. */
  eventId?: string;
  /** Skip sending Teams DM (still writes the in-app notification). */
  skipTeams?: boolean;
  /** If you have an AAD object id mapping, you can pass it as a fallback target. */
  aadObjectId?: string;
};

/**
 * Create an in-app notification and (best effort) send a Teams DM.
 * Backwards compatible: existing calls with 3 args still work.
 *
 * Schema expected in `public.notifications`:
 *   id uuid (pk), recipient_id uuid, type text/enum, payload jsonb, read boolean, created_at timestamptz
 *
 * For dedupe, create once in SQL:
 *   create unique index if not exists uq_notifications_event_per_user
 *     on public.notifications ((payload->>'event_id'), recipient_id)
 *     where (payload ? 'event_id');
 */
export async function notifyUser(
  recipientId: string,
  type: NotificationType,
  payload: any = {},
  opts?: NotifyOpts
) {
  const sb = supabaseAdmin();

  // Merge idempotency key if provided
  const payloadWithEvent =
    opts?.eventId && !payload?.event_id
      ? { ...payload, event_id: opts.eventId }
      : payload;

  // 1) Insert into in-app notifications (idempotent if unique index exists)
  try {
    const { error } = await sb.from("notifications").insert({
      recipient_id: recipientId,
      type,
      payload: payloadWithEvent,
      read: false,
    });
    if (error) {
      // If you added the unique(partial) index on (payload->>'event_id', recipient_id),
      // Supabase will return 23505 when the same event was already inserted.
      // Swallow that one; rethrow others.
      // @ts-ignore - supabase error has code
      if (error.code !== "23505") throw error;
    }
  } catch (err) {
    console.error("[notifyUser] insert notification failed", err);
    // Keep going: Teams DM is best-effort; caller shouldn't crash their flow
  }

  // 2) Teams DM (best-effort)
  if (!opts?.skipTeams) {
    // ✅ Feature flag: Disable course publishing Teams notifications
    const DISABLE_COURSE_PUBLISH_NOTIFICATIONS = process.env.DISABLE_COURSE_PUBLISH_NOTIFICATIONS === 'true';
    if (type === 'course_published' && DISABLE_COURSE_PUBLISH_NOTIFICATIONS) {
      console.log('🔕 Course publishing Teams notifications are disabled via feature flag');
      return;
    }

    const text = formatTeamsText(type, payloadWithEvent, payloadWithEvent?.title);
    console.log(`🚀 Attempting to send Teams DM to user ${recipientId} for notification type: ${type}`);

    // Primary: send by app user id (we store conversations by app user id in lib/teams/send)
    try {
      const sent = await sendTeamsDMToAppUser(recipientId, text);
      if (sent) {
        console.log(`✅ Teams DM sent successfully to user ${recipientId}`);
        return;
      } else {
        console.log(`⚠️ Teams DM not sent to user ${recipientId} - no Teams link found`);
      }
    } catch (e) {
      console.warn(`❌ Teams DM failed for user ${recipientId}:`, e);
    }

    // Optional fallback: if you mapped/know the AAD object id, try that too
    if (opts?.aadObjectId) {
      try {
        const mod = await import("@/lib/teams/send");
        const sendToAad = (mod as any).sendTeamsDMToAadUser;
        if (typeof sendToAad === "function") {
          await sendToAad(opts.aadObjectId, text);
        }
      } catch (e) {
        console.warn("[notifyUser] Teams DM (by AAD id) failed:", e);
      }
    }
  }
}
