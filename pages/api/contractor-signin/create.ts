// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { contractor_name, contractor_company, site_id, course_id, course_completed, working_airside, responsible_user_id } = req.body;

    if (!contractor_name || !site_id) {
      return res.status(400).json({ error: "contractor_name and site_id are required" });
    }

    const { data, error } = await supabaseAdmin()
      .from("contractor_signins")
      .insert({
        contractor_name,
        contractor_company: contractor_company || null,
        site_id,
        course_id: course_id || null,
        course_completed: course_completed ?? false,
        working_airside: working_airside ?? false,
        responsible_user_id: responsible_user_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("Contractor sign-in error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
