import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { contractor_name, contractor_company, site_id, course_id, course_completed, working_airside } = req.body;

    if (!contractor_name || !site_id) {
      return res.status(400).json({ error: "contractor_name and site_id are required" });
    }

    const result = await pool.query(
      `INSERT INTO contractor_signins (contractor_name, contractor_company, site_id, course_id, course_completed, working_airside)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        contractor_name,
        contractor_company || null,
        site_id,
        course_id || null,
        course_completed ?? false,
        working_airside ?? false,
      ]
    );

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error("Contractor sign-in error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
