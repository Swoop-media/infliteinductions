// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { days } = req.query;
    const daysBack = days ? parseInt(String(days)) : null;

    const sb = supabaseAdmin();

    let query = sb
      .from("contractor_signins")
      .select("*")
      .order("signed_in_at", { ascending: false });

    if (daysBack) {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);
      query = query.gte("signed_in_at", since.toISOString());
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    const siteIds = [...new Set((rows || []).map((r: any) => r.site_id).filter(Boolean))];
    const siteMap = new Map<string, string>();

    if (siteIds.length > 0) {
      const { data: sites } = await sb
        .from("sites")
        .select("id, name")
        .in("id", siteIds);

      if (sites) {
        for (const s of sites) siteMap.set(s.id, s.name);
      }
    }

    const data = (rows || []).map((row: any) => ({
      ...row,
      site_name: row.site_id ? siteMap.get(row.site_id) || null : null,
    }));

    return res.status(200).json({ data });
  } catch (err: any) {
    console.error("Error listing contractor sign-ins:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
