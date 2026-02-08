import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const signinResult = await pool.query(
      `SELECT cs.*, s.name as site_name
       FROM contractor_signins cs
       LEFT JOIN sites s ON cs.site_id::uuid = s.id
       WHERE cs.id = $1`,
      [id]
    );

    if (signinResult.rows.length === 0) {
      return res.status(404).json({ error: "Contractor sign-in not found" });
    }

    const signin = signinResult.rows[0];

    const prequalResult = await pool.query(
      `SELECT cps.*, s.name as site_name
       FROM contractor_prequal_submissions cps
       LEFT JOIN sites s ON cps.site_id::uuid = s.id
       WHERE LOWER(cps.contractor_name) = LOWER($1)
       ORDER BY cps.created_at DESC`,
      [signin.contractor_name]
    );

    const allSigninsResult = await pool.query(
      `SELECT id, site_id, signed_in_at, signed_out_at, course_completed, working_airside
       FROM contractor_signins
       WHERE LOWER(contractor_name) = LOWER($1) AND LOWER(COALESCE(contractor_company, '')) = LOWER(COALESCE($2, ''))
       ORDER BY signed_in_at DESC`,
      [signin.contractor_name, signin.contractor_company]
    );

    return res.status(200).json({
      signin: {
        ...signin,
        name: signin.contractor_name,
        company: signin.contractor_company,
      },
      prequalSubmissions: prequalResult.rows,
      signInHistory: allSigninsResult.rows,
    });
  } catch (err: any) {
    console.error("Error fetching contractor detail:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
