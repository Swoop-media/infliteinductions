// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";
import { supabaseAdmin } from "@/lib/supabase/admin";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { days } = req.query;
    const daysBack = days ? parseInt(String(days)) : null;

    let query = `SELECT id, contractor_name, contractor_company, site_id, course_id, 
                        course_completed, working_airside, signed_in_at, signed_out_at, created_at
                 FROM contractor_signins`;

    if (daysBack) {
      query += ` WHERE signed_in_at >= NOW() - INTERVAL '${daysBack} days'`;
    }

    query += ` ORDER BY signed_in_at DESC`;

    const result = await pool.query(query);

    const siteIds = [...new Set(result.rows.map(r => r.site_id).filter(Boolean))];
    const siteMap = new Map<string, string>();

    if (siteIds.length > 0) {
      const { data: sites } = await supabaseAdmin()
        .from("sites")
        .select("id, name")
        .in("id", siteIds);

      if (sites) {
        for (const s of sites) {
          siteMap.set(s.id, s.name);
        }
      }
    }

    const data = result.rows.map((row) => ({
      ...row,
      name: row.contractor_name,
      company: row.contractor_company,
      site_name: row.site_id ? siteMap.get(row.site_id) || null : null,
    }));

    return res.status(200).json({ data });
  } catch (err: any) {
    console.error("Error listing contractor sign-ins:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
