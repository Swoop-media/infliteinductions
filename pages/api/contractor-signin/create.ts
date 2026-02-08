import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { contractor_name, contractor_company, site_id, course_id, course_completed, working_airside } = req.body;

    if (!contractor_name || !site_id) {
      return res.status(400).json({ error: "contractor_name and site_id are required" });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("contractor_signins")
      .insert({
        contractor_name,
        contractor_company: contractor_company || null,
        site_id,
        course_id: course_id || null,
        course_completed: course_completed ?? false,
        working_airside: working_airside ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating contractor sign-in:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("Contractor sign-in error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
