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

    const courseIds = [...new Set((rows || []).map((r: any) => r.course_id).filter(Boolean))];
    const courseMap = new Map<string, { title: string; valid_for_days: number | null }>();

    if (courseIds.length > 0) {
      const { data: courses } = await sb
        .from("courses")
        .select("id, title, valid_for_days")
        .in("id", courseIds);

      if (courses) {
        for (const c of courses) courseMap.set(c.id, { title: c.title, valid_for_days: c.valid_for_days });
      }
    }

    const data = (rows || []).map((row: any) => {
      const course = row.course_id ? courseMap.get(row.course_id) : null;
      const validForDays = course?.valid_for_days ?? null;
      let expiry_date: string | null = null;

      if (row.course_completed && validForDays && validForDays > 0 && row.signed_in_at) {
        const completedDate = new Date(row.signed_in_at);
        completedDate.setDate(completedDate.getDate() + validForDays);
        expiry_date = completedDate.toISOString();
      }

      return {
        ...row,
        site_name: row.site_id ? siteMap.get(row.site_id) || null : null,
        course_title: course?.title || null,
        valid_for_days: validForDays,
        expiry_date,
      };
    });

    return res.status(200).json({ data });
  } catch (err: any) {
    console.error("Error listing contractor sign-ins:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
