import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { staffId, contractorName, siteName, companyName, submissionId } = req.body;

  if (!staffId || !contractorName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = supabaseAdmin();

    const { data: staff } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", staffId)
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://training.inflite.nz";
    
    const reviewLink = submissionId 
      ? `${baseUrl}/app/contractor-prequal/${submissionId}`
      : null;

    const messageParts = [
      "🔧 **Contractor Arrival**",
      "",
      `**${contractorName}**${companyName ? ` from ${companyName}` : ""} has arrived at ${siteName || "your site"}.`,
      "",
      "They have indicated that they sent their pre-qualification to you.",
      "",
      "Please verify their pre-qualification before allowing site access.",
    ];

    if (reviewLink) {
      messageParts.push("");
      messageParts.push(`**[Click here to review and upload documents](${reviewLink})**`);
    }

    const message = messageParts.join("\n");

    const sent = await sendTeamsDMToAppUser(staffId, message);

    if (sent) {
      console.log(`✅ Contractor arrival notification sent to ${staff?.full_name || staffId}`);
      return res.status(200).json({ success: true, notified: true });
    } else {
      console.log(`⚠️ No Teams link for staff: ${staffId}`);
      return res.status(200).json({ success: true, notified: false, reason: "No Teams link" });
    }
  } catch (error) {
    console.error("Error sending contractor arrival notification:", error);
    return res.status(500).json({
      error: "Failed to send notification",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
