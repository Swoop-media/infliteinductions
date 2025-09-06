// lib/notifications/dispatcher.ts
import { createClient } from "@supabase/supabase-js";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

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
  | "enrolment_request"
  | "enrolment_approved"
  | "enrolment_revoked"
  | "course_assigned"
  | "authorization_assigned"
  | "authorization_revoked"
  | "authorisation_pending_approval"
  | "role_granted"
  | "role_revoked"
  | "status_change"
  | "quiz_passed"
  | string;

function formatTeamsText(
  type: string,
  payload: any,
  fallbackTitle?: string
): string {
  const title = payload?.title || fallbackTitle || "Notification";
  const learner = payload?.learnerName || payload?.learner_email || "";
  const course = payload?.courseTitle || payload?.course_title || payload?.course_name || "";
  const url = payload?.url as string | undefined;

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

    case "course_assigned":
      return [
        "📚 Course assigned",
        course ? `• Course: ${course}` : "",
        payload?.assignedBy ? `• Assigned by: ${payload.assignedBy}` : "",
        url ? `• Start learning: ${url}` : "",
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
