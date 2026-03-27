const WEBHOOK_URLS = [
  process.env.TEAMS_WEBHOOK_CHANNEL_1,
  process.env.TEAMS_WEBHOOK_CHANNEL_2,
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

export async function postToAuthChannels(payload: WebhookPayload): Promise<void> {
  if (WEBHOOK_URLS.length === 0) {
    console.warn("No Teams webhook channel URLs configured");
    return;
  }

  const card = buildAdaptiveCard(payload);

  const results = await Promise.allSettled(
    WEBHOOK_URLS.map(async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Webhook failed (${res.status}): ${text}`);
      }
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
