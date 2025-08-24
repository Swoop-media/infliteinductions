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
  let { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  // If read_at column doesn't exist, fallback to is_read
  if (error && (error as any).code === "42703") {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  // Revalidate current page
  const referer = headers().get("referer") || "/app/home";
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
  let { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  // Fallback: boolean is_read
  if (error && (error as any).code === "42703") {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
  }

  const referer = headers().get("referer") || "/app/home";
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

  // 1) Persist the in-app notification (column names kept minimal to avoid schema conflicts)
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: n.recipientUserId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      data: n.data ?? null,
      // is_read / read_at are left to defaults so we don't touch older rows or schemas
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save notification: ${error.message}`);
  }

  // 2) Best-effort Teams DM (non-blocking; never deletes/updates existing notifications)
  if (n.sendTeams) {
    try {
      await trySendTeamsDM(n.recipientUserId, teamsTextFor(n));
      
      // Also try direct API call if the above module approach fails
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      await fetch(`${baseUrl}/api/teams/bot/debug-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: n.recipientUserId,
          message: teamsTextFor(n)
        })
      }).catch(() => {
        // Ignore API call failures too
      });
    } catch {
      // intentionally ignored; in-app is the source of truth
    }
  }

  return { id: data.id as string };
}
