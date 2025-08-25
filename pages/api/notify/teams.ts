
import type { NextApiRequest, NextApiResponse } from "next";
import { notifyUser } from "@/lib/notifications/dispatcher";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { recipientUserId, type, title, body, data } = req.body;

    if (!recipientUserId || !type || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Use the new notification dispatcher system
    await notifyUser(recipientUserId, type, {
      title,
      body,
      ...data,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Teams notification endpoint error:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
}
