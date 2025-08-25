
import type { NextApiRequest, NextApiResponse } from "next";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Teams notification request:", JSON.stringify(req.body, null, 2));
    
    const { recipientUserId, type, title, body, data } = req.body;

    if (!recipientUserId) {
      console.error("Missing recipientUserId");
      return res.status(400).json({ error: "Missing recipientUserId" });
    }

    // Format the Teams message based on type
    let teamsMessage = title || "Notification";
    
    if (type === "enrolment_request" && data) {
      teamsMessage = [
        "📥 **New enrollment request**",
        data.learnerName ? `• Learner: ${data.learnerName}` : "",
        data.learner_email ? `• Email: ${data.learner_email}` : "",
        data.courseTitle ? `• Course: ${data.courseTitle}` : "",
        "",
        body || "Please review this enrollment request in the admin panel."
      ].filter(Boolean).join("\n");
    }

    console.log("Sending Teams message to user:", recipientUserId);
    console.log("Message content:", teamsMessage);

    // Send Teams notification
    const sent = await sendTeamsDMToAppUser(recipientUserId, teamsMessage);
    
    if (sent) {
      console.log("✅ Teams notification sent successfully");
      res.status(200).json({ success: true });
    } else {
      console.log("⚠️ Teams notification not sent - no Teams link found");
      res.status(200).json({ success: false, reason: "No Teams link found" });
    }
  } catch (error) {
    console.error("Teams notification endpoint error:", error);
    res.status(500).json({ 
      error: "Failed to send notification",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
