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
    const { data, error } = await admin.rpc("insert_contractor_signin", {
      p_contractor_name: contractor_name,
      p_contractor_company: contractor_company || null,
      p_site_id: site_id,
      p_course_id: course_id || null,
      p_course_completed: course_completed ?? false,
      p_working_airside: working_airside ?? false,
    });

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
