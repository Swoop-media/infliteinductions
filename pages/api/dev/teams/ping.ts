import type { NextApiRequest, NextApiResponse } from "next";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

/**
 * POST /api/dev/teams/ping
 * body: { userId: "<app user id uuid>", text?: "optional message" }
 * Returns { ok: true } if we attempted the send (errors are logged but not thrown).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, text } = (typeof req.body === "object" ? req.body : {}) as {
    userId?: string;
    text?: string;
  };

  if (!userId) {
    return res.status(400).json({ ok: false, error: "Missing userId" });
  }

  const message = text || "🔔 Test DM from INFLITE — if you can read this, Teams linking works.";
  try {
    await sendTeamsDMToAppUser(userId, message);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("ping-teams send failed:", err);
    return res.status(500).json({ ok: false, error: "Send failed (check server logs)" });
  }
}

export const config = { api: { bodyParser: true } };
