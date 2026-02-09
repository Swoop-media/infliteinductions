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
      `SELECT cs.*, s.name as site_name, c.title as course_title
       FROM contractor_signins cs
       LEFT JOIN sites s ON cs.site_id = s.id
       LEFT JOIN courses c ON cs.course_id = c.id
       WHERE cs.id = $1`,
      [id]
    );

    if (signinResult.rows.length === 0) {
      return res.status(404).json({ error: "Contractor sign-in not found" });
    }

    const signin = signinResult.rows[0];

    const prequalResult = await pool.query(
      `SELECT cps.*, s.name as site_name, p.full_name as sent_to_name
       FROM contractor_prequal_submissions cps
       LEFT JOIN sites s ON cps.site_id::uuid = s.id
       LEFT JOIN profiles p ON cps.sent_to_user_id::uuid = p.id
       WHERE LOWER(cps.contractor_name) = LOWER($1)
         AND (
           cps.contractor_company IS NULL AND $2::text IS NULL
           OR LOWER(COALESCE(cps.contractor_company, '')) = LOWER(COALESCE($2::text, ''))
         )
       ORDER BY cps.created_at DESC`,
      [signin.contractor_name, signin.contractor_company]
    );

    const allSigninsResult = await pool.query(
      `SELECT cs.id, cs.site_id, cs.signed_in_at, cs.signed_out_at, cs.course_completed, cs.working_airside, cs.course_id, s.name as site_name, c.title as course_title
       FROM contractor_signins cs
       LEFT JOIN sites s ON cs.site_id = s.id
       LEFT JOIN courses c ON cs.course_id = c.id
       WHERE LOWER(cs.contractor_name) = LOWER($1) AND LOWER(COALESCE(cs.contractor_company, '')) = LOWER(COALESCE($2, ''))
       ORDER BY cs.signed_in_at DESC`,
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
