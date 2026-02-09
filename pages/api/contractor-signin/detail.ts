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
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const signinResult = await pool.query(
      `SELECT * FROM contractor_signins WHERE id = $1`,
      [id]
    );

    if (signinResult.rows.length === 0) {
      return res.status(404).json({ error: "Contractor sign-in not found" });
    }

    const signin = signinResult.rows[0];

    let siteName = null;
    if (signin.site_id) {
      const { data: site } = await supabaseAdmin()
        .from("sites")
        .select("name")
        .eq("id", signin.site_id)
        .single();
      siteName = site?.name || null;
    }

    let courseTitle = null;
    if (signin.course_id) {
      const { data: course } = await supabaseAdmin()
        .from("courses")
        .select("title")
        .eq("id", signin.course_id)
        .single();
      courseTitle = (course as any)?.title || null;
    }

    const { data: prequalData } = await supabaseAdmin()
      .from("contractor_prequal_submissions")
      .select("*")
      .ilike("contractor_name", signin.contractor_name);

    const prequalSubmissions = [];
    for (const p of (prequalData || [])) {
      let pSiteName = null;
      let sentToName = null;

      if ((p as any).site_id) {
        const { data: pSite } = await supabaseAdmin()
          .from("sites")
          .select("name")
          .eq("id", (p as any).site_id)
          .single();
        pSiteName = pSite?.name || null;
      }

      if ((p as any).sent_to_user_id) {
        const { data: profile } = await supabaseAdmin()
          .from("profiles")
          .select("full_name")
          .eq("id", (p as any).sent_to_user_id)
          .single();
        sentToName = (profile as any)?.full_name || null;
      }

      prequalSubmissions.push({
        ...(p as any),
        site_name: pSiteName,
        sent_to_name: sentToName,
      });
    }

    prequalSubmissions.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const allSigninsResult = await pool.query(
      `SELECT id, site_id, signed_in_at, signed_out_at, course_completed, working_airside, course_id
       FROM contractor_signins
       WHERE LOWER(contractor_name) = LOWER($1) AND LOWER(COALESCE(contractor_company, '')) = LOWER(COALESCE($2, ''))
       ORDER BY signed_in_at DESC`,
      [signin.contractor_name, signin.contractor_company]
    );

    const signInHistory = [];
    for (const entry of allSigninsResult.rows) {
      let entrySiteName = null;
      let entryCourseTitle = null;

      if (entry.site_id) {
        if (entry.site_id === signin.site_id) {
          entrySiteName = siteName;
        } else {
          const { data: s } = await supabaseAdmin()
            .from("sites")
            .select("name")
            .eq("id", entry.site_id)
            .single();
          entrySiteName = s?.name || null;
        }
      }

      if (entry.course_id) {
        if (entry.course_id === signin.course_id) {
          entryCourseTitle = courseTitle;
        } else {
          const { data: c } = await supabaseAdmin()
            .from("courses")
            .select("title")
            .eq("id", entry.course_id)
            .single();
          entryCourseTitle = (c as any)?.title || null;
        }
      }

      signInHistory.push({
        ...entry,
        site_name: entrySiteName,
        course_title: entryCourseTitle,
      });
    }

    return res.status(200).json({
      signin: {
        ...signin,
        site_name: siteName,
        course_title: courseTitle,
        name: signin.contractor_name,
        company: signin.contractor_company,
      },
      prequalSubmissions,
      signInHistory,
    });
  } catch (err: any) {
    console.error("Error fetching contractor detail:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
