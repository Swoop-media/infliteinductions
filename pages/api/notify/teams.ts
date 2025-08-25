
import type { NextApiRequest, NextApiResponse } from "next";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Teams notification request received:");
    console.log("Raw body:", JSON.stringify(req.body, null, 2));
    
    // Handle both database trigger format and webhook format
    const { recipientUserId, type, title, body, data, record } = req.body;
    
    // Extract recipient ID from either direct call or webhook record
    const recipient = recipientUserId || record?.recipient_id;
    
    console.log("📋 Extracted values:");
    console.log("- recipientUserId:", recipientUserId);
    console.log("- type:", type);
    console.log("- title:", title);
    console.log("- record.recipient_id:", record?.recipient_id);
    console.log("- Final recipient:", recipient);
    
    if (!recipient) {
      console.error("❌ Missing recipient ID. Expected recipientUserId or record.recipient_id");
      console.log("Available keys in req.body:", Object.keys(req.body));
      return res.status(400).json({ error: "Missing recipient ID" });
    }

    // Extract notification details from either direct call or webhook record
    const notificationType = type || record?.type;
    const payload = data || record?.payload || {};
    const createdAt = record?.created_at;
    
    // Format the Teams message based on type
    let teamsMessage = title || "Notification";
    
    if (notificationType === "enrolment_request") {
      const courseTitle = payload.course_title || payload.courseTitle || "Unknown course";
      const dateTime = createdAt ? new Date(createdAt).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }) : "";
      
      teamsMessage = [
        "📥 **New enrolment request**",
        `• Course: ${courseTitle}`,
        dateTime ? `• Time: ${dateTime}` : "",
        "",
        body || "Please review this enrollment request in the admin panel."
      ].filter(Boolean).join("\n");
    } else if (data || payload) {
      // Handle other notification types with available data
      teamsMessage = [
        `🔔 **${title || notificationType || "Notification"}**`,
        payload.course_title ? `• Course: ${payload.course_title}` : "",
        payload.learnerName ? `• Learner: ${payload.learnerName}` : "",
        createdAt ? `• Time: ${new Date(createdAt).toLocaleString('en-AU', {
          timeZone: 'Australia/Sydney', 
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })}` : "",
        "",
        body || ""
      ].filter(Boolean).join("\n");
    }

    console.log("📤 Attempting to send Teams message:");
    console.log("- To user:", recipient);
    console.log("- Message content:", teamsMessage);
    console.log("- Message length:", teamsMessage.length);

    // Send Teams notification
    const sent = await sendTeamsDMToAppUser(recipient, teamsMessage);
    
    if (sent) {
      console.log("✅ Teams notification sent successfully to user:", recipient);
      res.status(200).json({ success: true, recipient, messageLength: teamsMessage.length });
    } else {
      console.log("⚠️ Teams notification not sent - no Teams link found for user:", recipient);
      res.status(200).json({ success: false, reason: "No Teams link found", recipient });
    }
  } catch (error) {
    console.error("Teams notification endpoint error:", error);
    res.status(500).json({ 
      error: "Failed to send notification",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
