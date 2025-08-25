
import type { NextApiRequest, NextApiResponse } from "next";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Teams notification request:", JSON.stringify(req.body, null, 2));
    
    // Handle both database trigger format and webhook format
    const { recipientUserId, type, title, body, data, record } = req.body;
    
    // Extract recipient ID from either direct call or webhook record
    const recipient = recipientUserId || record?.recipient_id;
    
    if (!recipient) {
      console.error("Missing recipient ID. Expected recipientUserId or record.recipient_id");
      return res.status(400).json({ error: "Missing recipient ID" });
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

    console.log("Sending Teams message to user:", recipient);
    console.log("Message content:", teamsMessage);

    // Send Teams notification
    const sent = await sendTeamsDMToAppUser(recipient, teamsMessage);
    
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
