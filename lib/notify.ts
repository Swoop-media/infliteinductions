// lib/notify.ts
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Creates an in-app notification for a user and (optionally) sends an email via Resend.
 * - If RESEND_API_KEY is missing, email is skipped (in-app still created).
 */
export async function notifyUser(options: {
  recipientId: string;
  recipientEmail?: string | null;
  type:
    | "role_granted"
    | "role_revoked"
    | "profile_updated"
    | "enrolment_request"
    | "enrolment_approved"
    | "course_completed"
    | "authorisation_ready";
  subject?: string; // email subject override
  text?: string; // email plain text override
  payload?: Record<string, any>;
}) {
  const {
    recipientId,
    recipientEmail,
    type,
    subject,
    text,
    payload = {},
  } = options;

  // 1) In-app notification
  const supabase = createSupabaseServer();
  const { error: insertErr } = await supabase.from("notifications").insert({
    recipient_id: recipientId,
    type,
    payload,
    read: false,
  });
  if (insertErr) {
    // Soft-fail: don't throw to avoid breaking the UX
    console.error("notifyUser: insert notification failed", insertErr);
  }

  // 2) Email via Resend (optional)
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
      : "Notification from INFLITE Induction & Training");

  const emailText =
    text ||
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
        from: "INFLITE LMS <onboarding@resend.dev>", // you can switch to a verified domain on Resend
        to: [recipientEmail],
        subject: emailSubject,
        text: emailText,
      }),
    });
  } catch (e) {
    console.error("notifyUser: email send failed", e);
  }
}
