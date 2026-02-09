// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const sb = supabaseAdmin();

    const { data: signin, error: signinError } = await sb
      .from("contractor_signins")
      .select("*")
      .eq("id", id)
      .single();

    if (signinError || !signin) {
      return res.status(404).json({ error: "Contractor sign-in not found" });
    }

    let siteName = null;
    if (signin.site_id) {
      const { data: site } = await sb.from("sites").select("name").eq("id", signin.site_id).single();
      siteName = site?.name || null;
    }

    let courseTitle = null;
    if (signin.course_id) {
      const { data: course } = await sb.from("courses").select("title").eq("id", signin.course_id).single();
      courseTitle = course?.title || null;
    }

    const { data: prequalSubmissions } = await sb
      .from("contractor_prequal_submissions")
      .select("*")
      .ilike("contractor_name", signin.name)
      .ilike("contractor_company", signin.company || "")
      .order("created_at", { ascending: false });

    const enrichedPrequal = [];
    for (const sub of (prequalSubmissions || [])) {
      let subSiteName = null;
      if (sub.site_id) {
        const { data: site } = await sb.from("sites").select("name").eq("id", sub.site_id).single();
        subSiteName = site?.name || null;
      }
      let sentToName = null;
      if (sub.sent_to_user_id) {
        const { data: profile } = await sb.from("profiles").select("full_name").eq("id", sub.sent_to_user_id).single();
        sentToName = profile?.full_name || null;
      }
      enrichedPrequal.push({ ...sub, site_name: subSiteName, sent_to_name: sentToName });
    }

    const { data: history } = await sb
      .from("contractor_signins")
      .select("*")
      .ilike("name", signin.name)
      .order("signed_in_at", { ascending: false });

    const enrichedHistory = [];
    for (const h of (history || [])) {
      let hSiteName = null;
      if (h.site_id) {
        const { data: site } = await sb.from("sites").select("name").eq("id", h.site_id).single();
        hSiteName = site?.name || null;
      }
      let hCourseTitle = null;
      if (h.course_id) {
        const { data: course } = await sb.from("courses").select("title").eq("id", h.course_id).single();
        hCourseTitle = course?.title || null;
      }
      enrichedHistory.push({ ...h, site_name: hSiteName, course_title: hCourseTitle });
    }

    return res.status(200).json({
      signin: {
        ...signin,
        site_name: siteName,
        course_title: courseTitle,
      },
      prequalSubmissions: enrichedPrequal,
      signInHistory: enrichedHistory,
    });
  } catch (err: any) {
    console.error("Error fetching contractor detail:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
