// Sanitize env values that were pasted with extra characters, e.g.
// `TEAMS_WEBHOOK_CHANNEL_1="https://..."` or `"https://..."` stored as the value.
function sanitizeWebhookUrl(raw: string | undefined, name: string): string | null {
  if (!raw) return null;
  let v = raw.trim();
  // Strip a leading `NAME=` prefix if the whole assignment was pasted as the value
  const eq = v.indexOf("=");
  if (eq > 0 && !v.slice(0, eq).includes("://") && /^[A-Z0-9_]+$/.test(v.slice(0, eq).trim())) {
    v = v.slice(eq + 1).trim();
  }
  // Strip surrounding quotes
  v = v.replace(/^["']+/, "").replace(/["']+$/, "").trim();
  try {
    const parsed = new URL(v);
    if (parsed.protocol !== "https:") throw new Error("not https");
    return v;
  } catch {
    console.error(`❌ ${name} is set but is not a valid https URL after sanitizing`);
    return null;
  }
}

const WEBHOOK_URLS = [
  sanitizeWebhookUrl(process.env.TEAMS_WEBHOOK_CHANNEL_1, "TEAMS_WEBHOOK_CHANNEL_1"),
  sanitizeWebhookUrl(process.env.TEAMS_WEBHOOK_CHANNEL_2, "TEAMS_WEBHOOK_CHANNEL_2"),
].filter(Boolean) as string[];

interface WebhookPayload {
  type: "approved" | "rejected";
  authorizationTitle: string;
  learnerName: string;
  approverOrRejector: string;
  validFor?: number | null;
  expiryDate?: string | null;
  restrictions?: string | null;
  moduleTitle?: string;
  courseTitle?: string;
  rejectionReason?: string;
  url?: string;
}

function buildAdaptiveCard(payload: WebhookPayload) {
  const isApproval = payload.type === "approved";

  const facts: { title: string; value: string }[] = [
    { title: "Authorisation", value: payload.authorizationTitle },
    { title: "Learner", value: payload.learnerName },
    { title: isApproval ? "Approved by" : "Rejected by", value: payload.approverOrRejector },
  ];

  if (isApproval) {
    if (payload.expiryDate) {
      facts.push({ title: "Expires", value: payload.expiryDate });
    } else if (payload.validFor) {
      facts.push({ title: "Valid for", value: `${payload.validFor} days` });
    }
    if (payload.restrictions) {
      facts.push({ title: "Restrictions", value: payload.restrictions });
    }
  } else {
    if (payload.moduleTitle) {
      facts.push({ title: "Module", value: payload.moduleTitle });
    }
    if (payload.courseTitle) {
      facts.push({ title: "Course", value: payload.courseTitle });
    }
    if (payload.rejectionReason) {
      facts.push({ title: "Reason", value: payload.rejectionReason });
    }
  }

  const body: any[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: isApproval
        ? "✅ Authorisation Approved"
        : "❌ Authorisation Rejected (Module Resit Required)",
      color: isApproval ? "Good" : "Attention",
    },
    {
      type: "FactSet",
      facts: facts,
    },
  ];

  if (payload.url) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://training.inflite.nz";
    const fullUrl = payload.url.startsWith("http") ? payload.url : `${siteUrl}${payload.url}`;
    body.push({
      type: "ActionSet",
      actions: [
        {
          type: "Action.OpenUrl",
          title: isApproval ? "View Details" : "Review Assignment",
          url: fullUrl,
        },
      ],
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
        },
      },
    ],
  };
}

interface IssueReportWebhookPayload {
  reporterName: string;
  reporterEmail: string;
  message: string;
  pageUrl?: string;
  userAgent?: string;
  platform?: string;
  viewport?: string;
  attachmentsCount?: number;
  timestamp?: string;
}

function buildIssueReportCard(payload: IssueReportWebhookPayload) {
  const facts: { title: string; value: string }[] = [
    { title: "Reporter", value: payload.reporterName },
    { title: "Email", value: payload.reporterEmail || "Not available" },
  ];

  if (payload.pageUrl) facts.push({ title: "Page", value: payload.pageUrl });
  if (payload.platform) facts.push({ title: "Platform", value: payload.platform });
  if (payload.viewport) facts.push({ title: "Viewport", value: payload.viewport });
  if (payload.userAgent) facts.push({ title: "User Agent", value: payload.userAgent });
  if (typeof payload.attachmentsCount === "number") {
    facts.push({ title: "Attachments", value: String(payload.attachmentsCount) });
  }
  if (payload.timestamp) facts.push({ title: "Reported at", value: payload.timestamp });

  const body: any[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: "🐞 Issue Reported",
      color: "Attention",
    },
    {
      type: "FactSet",
      facts,
    },
    {
      type: "TextBlock",
      text: "**Description:**",
      weight: "Bolder",
      spacing: "Medium",
    },
    {
      type: "TextBlock",
      text: payload.message,
      wrap: true,
    },
  ];

  if (payload.pageUrl) {
    body.push({
      type: "ActionSet",
      actions: [
        {
          type: "Action.OpenUrl",
          title: "Open Page",
          url: payload.pageUrl,
        },
      ],
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
        },
      },
    ],
  };
}

export async function postIssueReportToChannel(
  payload: IssueReportWebhookPayload
): Promise<boolean> {
  const url = sanitizeWebhookUrl(process.env.TEAMS_WEBHOOK_REPORT_ISSUE, "TEAMS_WEBHOOK_REPORT_ISSUE");
  if (!url) {
    console.warn("TEAMS_WEBHOOK_REPORT_ISSUE not configured");
    return false;
  }

  const card = buildIssueReportCard(payload);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
      // Hard timeout: hung outbound fetches pile up and wedge the VM (Aug 2026).
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ Report Issue webhook failed (${res.status}):`, text);
      return false;
    }
    // Consume the body so undici releases the socket.
    await res.arrayBuffer().catch(() => {});
    console.log("✅ Report Issue webhook posted successfully");
    return true;
  } catch (err) {
    console.error("❌ Report Issue webhook error:", err);
    return false;
  }
}

/**
 * Claim an idempotency key in webhook_post_dedupe. Returns true if this is
 * the first claim (safe to post), false if the event was already posted.
 * Fails open (returns true) if the dedupe table is unavailable so channel
 * posts are never silently dropped by infrastructure issues.
 */
async function claimEventKey(eventKey: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { error } = await supabaseAdmin()
      .from("webhook_post_dedupe")
      .insert({ event_key: eventKey });
    if (error) {
      // 23505 = already claimed → duplicate post, skip
      if ((error as any).code === "23505") return false;
      console.error("webhook_post_dedupe claim failed (posting anyway):", error.message);
    }
    return true;
  } catch (e) {
    console.error("webhook_post_dedupe claim error (posting anyway):", e);
    return true;
  }
}

export async function postToAuthChannels(
  payload: WebhookPayload,
  opts?: { eventKey?: string }
): Promise<void> {
  if (WEBHOOK_URLS.length === 0) {
    console.warn("No Teams webhook channel URLs configured");
    return;
  }

  if (opts?.eventKey) {
    const firstClaim = await claimEventKey(opts.eventKey);
    if (!firstClaim) {
      console.log(`🔁 Duplicate channel post suppressed (${opts.eventKey})`);
      return;
    }
  }

  const card = buildAdaptiveCard(payload);

  const results = await Promise.allSettled(
    WEBHOOK_URLS.map(async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
        // Hard timeout: hung outbound fetches pile up and wedge the VM (Aug 2026).
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Webhook failed (${res.status}): ${text}`);
      }
      // Consume the body so undici releases the socket.
      await res.arrayBuffer().catch(() => {});
      return res.status;
    })
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`✅ Teams channel webhook ${i + 1} posted successfully`);
    } else {
      console.error(`❌ Teams channel webhook ${i + 1} failed:`, r.reason);
    }
  });
}
