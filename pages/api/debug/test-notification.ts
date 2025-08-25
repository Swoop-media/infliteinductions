
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, courseId } = req.body;
  
  if (!userId || !courseId) {
    return res.status(400).json({ error: "Missing userId or courseId" });
  }

  const supabase = supabaseAdmin();

  try {
    // Call the SQL function directly
    const { data, error } = await supabase.rpc('notify_enrolment_request', {
      p_user_id: userId,
      p_course_id: courseId
    });

    if (error) {
      console.error("RPC call failed:", error);
      return res.status(500).json({ error: error.message });
    }

    // Check if notifications were created
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    return res.status(200).json({ 
      success: true, 
      rpcResult: data,
      recentNotifications: notifications 
    });

  } catch (err) {
    console.error("Test notification failed:", err);
    return res.status(500).json({ error: "Test failed" });
  }
}
