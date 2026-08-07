import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase admin env not set");
  return createClient(url, key, {
    auth: { persistSession: false },
    // Hard cap on Supabase HTTP round-trips so connection blips can't hang
    // requests indefinitely and saturate the VM (Aug 2026 outages).
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const supabase = supabaseAdmin();
    console.log("Running 5pm sign-out reminder job...");

    const { data: sites } = await supabase
      .from("sites")
      .select("id, name");
    const siteMap = new Map((sites || []).map((s: any) => [s.id, s.name]));

    const { data: visitors, error: visitorsError } = await supabase
      .from("visitor_signins")
      .select("id, name, site_id, visiting_user_id, signed_in_at")
      .is("signed_out_at", null);

    if (visitorsError) {
      console.error("Error fetching visitors:", visitorsError);
    }

    const { data: contractors, error: contractorsError } = await supabase
      .from("contractor_signins")
      .select("id, name, company, site_id, responsible_user_id, signed_in_at")
      .is("signed_out_at", null);

    if (contractorsError) {
      console.error("Error fetching contractors:", contractorsError);
    }

    console.log(`Found ${visitors?.length || 0} visitors and ${contractors?.length || 0} contractors still signed in`);

    const staffNotifications: Map<string, {
      visitors: Array<{ name: string; siteName: string; signedInAt: string }>;
      contractors: Array<{ name: string; company: string | null; siteName: string; signedInAt: string }>;
    }> = new Map();

    for (const visitor of (visitors || [])) {
      if (!visitor.visiting_user_id) continue;
      
      if (!staffNotifications.has(visitor.visiting_user_id)) {
        staffNotifications.set(visitor.visiting_user_id, { visitors: [], contractors: [] });
      }
      
      staffNotifications.get(visitor.visiting_user_id)!.visitors.push({
        name: visitor.name,
        siteName: siteMap.get(visitor.site_id) || "Unknown",
        signedInAt: visitor.signed_in_at,
      });
    }

    for (const contractor of (contractors || [])) {
      if (!contractor.responsible_user_id) {
        console.log(`Contractor ${contractor.name} has no responsible_user_id, skipping notification`);
        continue;
      }
      
      if (!staffNotifications.has(contractor.responsible_user_id)) {
        staffNotifications.set(contractor.responsible_user_id, { visitors: [], contractors: [] });
      }
      
      staffNotifications.get(contractor.responsible_user_id)!.contractors.push({
        name: contractor.name,
        company: contractor.company || null,
        siteName: siteMap.get(contractor.site_id) || "Unknown",
        signedInAt: contractor.signed_in_at,
      });
    }

    let notificationsSent = 0;
    let notificationsFailed = 0;

    for (const [staffId, data] of staffNotifications) {
      if (data.visitors.length === 0 && data.contractors.length === 0) continue;

      const lines: string[] = [
        "**Sign-out Reminder**",
        "",
        "The following people are still signed in and haven't signed out:",
        "",
      ];

      if (data.visitors.length > 0) {
        lines.push("**Visitors:**");
        for (const v of data.visitors) {
          const time = new Date(v.signedInAt).toLocaleString("en-NZ", {
            timeZone: "Pacific/Auckland",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          lines.push(`- ${v.name} (${v.siteName}) - signed in at ${time}`);
        }
        lines.push("");
      }

      if (data.contractors.length > 0) {
        lines.push("**Contractors:**");
        for (const c of data.contractors) {
          const time = new Date(c.signedInAt).toLocaleString("en-NZ", {
            timeZone: "Pacific/Auckland",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""} at ${c.siteName} - signed in at ${time}`);
        }
        lines.push("");
      }

      lines.push("Please ensure they sign out before leaving the site.");

      const message = lines.join("\n");

      try {
        const sent = await sendTeamsDMToAppUser(staffId, message);
        if (sent) {
          notificationsSent++;
          console.log(`Reminder sent to staff: ${staffId}`);
        } else {
          console.log(`No Teams link for staff: ${staffId}`);
        }
      } catch (err) {
        console.error(`Failed to send reminder to ${staffId}:`, err);
        notificationsFailed++;
      }
    }

    const totalUnsignedOut = (visitors?.length || 0) + (contractors?.length || 0);
    console.log(`Sign-out reminder complete: ${totalUnsignedOut} people still signed in, ${notificationsSent} notifications sent`);

    res.status(200).json({
      success: true,
      totalUnsignedOut,
      visitorsCount: visitors?.length || 0,
      contractorsCount: contractors?.length || 0,
      notificationsSent,
      notificationsFailed,
    });
  } catch (error) {
    console.error("Sign-out reminder job error:", error);
    res.status(500).json({
      error: "Failed to run sign-out reminder",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
