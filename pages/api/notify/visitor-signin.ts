import type { NextApiRequest, NextApiResponse } from "next";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { 
      visitorName, 
      visitorEmail, 
      visitorPhone,
      visitingUserId, 
      siteName,
      signedInAt 
    } = req.body;

    if (!visitingUserId) {
      return res.status(400).json({ error: "Missing visiting user ID" });
    }

    if (!visitorName) {
      return res.status(400).json({ error: "Missing visitor name" });
    }

    const dateTime = signedInAt 
      ? new Date(signedInAt).toLocaleString('en-NZ', {
          timeZone: 'Pacific/Auckland',
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      : new Date().toLocaleString('en-NZ', {
          timeZone: 'Pacific/Auckland',
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

    const teamsMessage = [
      "👋 **Visitor Arrival**",
      "",
      `**${visitorName}** has arrived to see you.`,
      "",
      siteName ? `📍 **Location:** ${siteName}` : "",
      visitorPhone ? `📞 **Phone:** ${visitorPhone}` : "",
      visitorEmail ? `📧 **Email:** ${visitorEmail}` : "",
      `🕐 **Time:** ${dateTime}`,
    ].filter(Boolean).join("\n");

    console.log("📤 Sending visitor sign-in notification to user:", visitingUserId);
    console.log("📝 Message:", teamsMessage);

    const sent = await sendTeamsDMToAppUser(visitingUserId, teamsMessage);

    if (sent) {
      console.log("✅ Visitor notification sent successfully");
      res.status(200).json({ success: true });
    } else {
      console.log("⚠️ Visitor notification not sent - no Teams link found");
      res.status(200).json({ success: false, reason: "No Teams link found for recipient" });
    }
  } catch (error) {
    console.error("Visitor notification endpoint error:", error);
    res.status(500).json({ 
      error: "Failed to send notification",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
