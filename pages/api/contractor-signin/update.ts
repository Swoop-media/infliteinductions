// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, signed_out_at } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const { data, error } = await supabaseAdmin()
      .from("contractor_signins")
      .update({ signed_out_at: signed_out_at || new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("Error updating contractor sign-in:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
