// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { contractorName, contractorCompany, siteId, sentToUserId } = req.body;

    if (!contractorName || !siteId || !sentToUserId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabaseAdmin()
      .from("contractor_prequal_submissions")
      .insert({
        contractor_name: contractorName,
        contractor_company: contractorCompany || null,
        site_id: siteId,
        sent_to_user_id: sentToUserId,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create prequal submission:", error);
      return res.status(500).json({ error: "Failed to create submission", details: error.message });
    }

    return res.status(200).json({ submissionId: data.id });
  } catch (error) {
    console.error("Error in contractor-prequal/create:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
