// @ts-nocheck
// lib/notify.ts
import { createSupabaseServer } from "@/lib/supabase/server";

/** Central list so we don't mistype anywhere */
export type NotificationType =
  | "role_granted"
  | "role_revoked"
  | "profile_updated"
  | "enrolment_request"
  | "enrolment_approved"
  | "enrolment_revoked"
  | "course_completed"
  | "course_updated"
  | "course_published"  // ✅ Added for future use (can be disabled via env var)
  | "authorisation_ready";

/**
 * Creates an in-app notification for a user and (optionally) sends an email via Resend.
 * - If RESEND_API_KEY is missing, email is skipped (in-app still created).
 * - Stores into public.notifications(recipient_id, type, payload, read)
 */
export async function notifyUser(options: {
  recipientId: string;
  recipientEmail?: string | null;
  type: NotificationType;
  subject?: string; // email subject override
  text?: string;    // email plain text override
  payload?: Record<string, any>;
}) {
  const { recipientId, recipientEmail, type, subject, text, payload = {} } = options;

  // Publish notifications are permanently disabled — changes are tracked in
  // the Admin > Audit Trail tab instead.
  if (type === 'course_published' || type === 'authorisation_published') {
    console.log(`🔕 ${type} notifications are disabled (tracked in Audit Trail instead)`);
    return;
  }

  const supabase = await createSupabaseServer();
  const { error: insertErr } = await supabase.from("notifications").insert({
    recipient_id: recipientId,
    type,
    payload,
    read: false,
  });
  if (insertErr) {
    // Soft-fail so UX isn't blocked
    console.error("notifyUser: insert notification failed", insertErr);
  }

  // Email via Resend (optional)
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !recipientEmail) return;

  const emailSubject =
    subject ||
    (type === "role_granted"
      ? `Role granted: ${payload?.role_name ?? ""}`
      : type === "role_revoked"
      ? `Role revoked: ${payload?.role_name ?? ""}`
      : type === "profile_updated"
      ? "Your profile was updated"
      : type === "enrolment_approved"
      ? `Enrolment approved: ${payload?.course_title ?? ""}`
      : type === "enrolment_revoked"
      ? `Enrolment revoked: ${payload?.course_title ?? ""}`
      : type === "course_updated"
      ? `Course Updated - Resit Required: ${payload?.course_title ?? ""}`
      : type === "course_published"
      ? `Course Published: ${payload?.title ?? ""}`
      : "Notification from INFLITE Induction & Training");

  const emailText =
    text ??
    (() => {
      switch (type) {
        case "role_granted":
          return `Hi, a new role has been granted to your account: ${payload?.role_name ?? ""}.`;
        case "role_revoked":
          return `Hi, a role has been revoked from your account: ${payload?.role_name ?? ""}.`;
        case "profile_updated":
          return `Hi, an admin has updated your profile details.`;
        case "enrolment_approved":
          return `Your enrolment was approved for: ${payload?.course_title ?? ""}.`;
        case "enrolment_revoked":
          return `Your enrolment was revoked for: ${payload?.course_title ?? ""}.`;
        case "course_updated":
          return `The course "${payload?.course_title ?? ""}" has been updated and you need to complete it again. Please log in to start your resit.`;
        case "course_published":
          return `A new course "${payload?.title ?? ""}" has been published and is now available for enrollment.`;
        default:
          return `You have a new notification in INFLITE Induction & Training.`;
      }
    })();

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "INFLITE LMS <onboarding@resend.dev>", // swap to your verified sender
        to: [recipientEmail],
        subject: emailSubject,
        text: emailText,
      }),
    });
  } catch (e) {
    console.error("notifyUser: email send failed", e);
  }
}

/**
 * Notify everyone who has ANY of the given role names.
 * (Looks up role IDs, gets user_ids from user_roles, joins profiles for email.)
 */
export async function notifyRoles(
  roleNames: string[],
  payload: Omit<Parameters<typeof notifyUser>[0], "recipientId" | "recipientEmail">
) {
  if (!roleNames.length) return;
  const supabase = await createSupabaseServer();

  // roles → ids
  const { data: roles, error: rErr } = await supabase
    .from("roles")
    .select("id,name")
    .in("name", roleNames);
  if (rErr) {
    console.error("notifyRoles: roles lookup failed", rErr);
    return;
  }
  const roleIds = (roles ?? []).map((r) => r.id);
  if (!roleIds.length) return;

  // users for those roles
  const { data: urs, error: uErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);
  if (uErr) {
    console.error("notifyRoles: user_roles lookup failed", uErr);
    return;
  }
  const userIds = Array.from(new Set((urs ?? []).map((u) => u.user_id)));
  if (!userIds.length) return;

  // emails
  const { data: profs, error: pErr } = await supabase
    .from("profiles")
    .select("id,email")
    .in("id", userIds);
  if (pErr) {
    console.error("notifyRoles: profiles lookup failed", pErr);
    return;
  }
  const emailById = new Map((profs ?? []).map((p) => [p.id, p.email as string | null]));

  for (const uid of userIds) {
    const recipientEmail = emailById.get(uid) ?? null;
    await notifyUser({ recipientId: uid, recipientEmail, ...payload });
  }
}
