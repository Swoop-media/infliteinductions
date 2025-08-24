// pages/api/notify/teams.ts
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: true },
};

// OPTIONAL helper: if you created "@/lib/teams/send" earlier
async function sendToTeams(userId: string, text: string, isAadId: boolean) {
  try {
    const mod = await import("@/lib/teams/send");
    if (isAadId && typeof (mod as any).sendTeamsDMToAadUser === "function") {
      await (mod as any).sendTeamsDMToAadUser(userId, text);
      return true;
    }
    if (!isAadId && typeof (mod as any).sendTeamsDMToAppUser === "function") {
      await (mod as any).sendTeamsDMToAppUser(userId, text);
      return true;
    }
  } catch {}
  return false;
}

function formatMessage(row: any) {
  const type = row?.type ?? "notification";
  const payload = row?.payload ?? {};
  const title = payload?.title ?? row?.title ?? "Notification";
  const body = payload?.body ?? row?.body ?? "";

  if (type === "enrolment_request" || type === "enrollment_request") {
    const learner = payload?.learnerName || payload?.learner_email || "";
    const course = payload?.courseTitle || payload?.course_name || "";
    return [
      "📥 *Enrollment request*",
      learner ? `• Learner: ${learner}` : "",
      course ? `• Course: ${course}` : "",
      body ? `\n${body}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // default
  return `🔔 ${title}${body ? `\n\n${body}` : ""}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  try {
    const { recipientUserId, type, title, body, data } = req.body;

    console.log("Teams notify request:", {
      recipientUserId,
      type,
      title,
      body: body?.substring(0, 100) + "...",
      data
    });

    if (!recipientUserId || !type || !title) {
      console.log("Missing required fields in Teams notify request");
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Accept any of these header names (Node lowercases headers):
    const h = req.headers;
    const gotHeader =
      (h["supabase_db_webhook"] as string | undefined) ??
      (h["x-supabase-webhook-secret"] as string | undefined) ??
      (h["x-supabase-signature"] as string | undefined) ??
      "";

    const expected = process.env.SUPABASE_DB_WEBHOOK_SECRET ?? "";
    const match = expected && gotHeader && gotHeader === expected;

    if (!match) {
      console.warn("DB webhook auth failed", {
        gotHeader: Boolean(gotHeader),
        expectedConfigured: Boolean(expected),
        match,
      });
      return res.status(401).end();
    }

    // Supabase DB Webhooks post: { type, table, schema, record, old_record, ... }
    // We tolerate direct-row posts too.
    const payload = typeof req.body === "object" ? req.body : JSON.parse(String(req.body || "{}"));
    const row = payload?.record ?? payload;

    // Your schema: recipient_id (uuid), type (enum/text), payload (jsonb), read (bool), created_at
    const recipientId = row?.recipient_id as string | undefined;
    if (!recipientId) return res.status(200).json({ ok: true, skipped: "no recipient_id" });

    const text = formatMessage(row);

    // Try to send Teams message
    try {
      console.log("Attempting to send Teams message to user:", recipientUserId);
      const success = await sendToTeams(recipientUserId, text, false);
      console.log("Teams send result:", success);

      if (success) {
        res.status(200).json({ success: true, message: "Teams notification sent" });
      } else {
        console.log("Teams send returned false - no conversation found");
        res.status(200).json({ success: false, message: "No Teams conversation found for user" });
      }
    } catch (teamsError) {
      console.error("Teams notification failed:", teamsError);
      res.status(200).json({ success: false, message: "Teams notification failed", error: String(teamsError) });
    }
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: "Internal server error", details: String(error) });
  }
}