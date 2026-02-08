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
    const { id, signed_out_at } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await pool.query(
      `UPDATE contractor_signins SET signed_out_at = $1 WHERE id = $2 RETURNING *`,
      [signed_out_at || new Date().toISOString(), id]
    );

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error("Error updating contractor sign-in:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
