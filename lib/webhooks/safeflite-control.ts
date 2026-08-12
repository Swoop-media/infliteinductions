const SAFEFLITE_FUNCTIONS_BASE =
  "https://yakvuypqwqhdtkpgqdcf.supabase.co/functions/v1";

export interface SafefliteRisk {
  id: string;
  risk_code: string | null;
  title: string;
  is_enterprise: boolean;
  risk_kind: string | null;
  status: string;
  /** Parent enterprise risk id for contributing risks; null for ERs, legacy risks, and unparented CRs. May be absent until the SafeFLITE list-risks function is redeployed. */
  parent_risk_id?: string | null;
}

export interface UpsertTrainingControlPayload {
  external_id: string;
  course_title: string;
  course_status?: string;
  preview_url: string;
  risk_ids: string[];
  archived?: boolean;
}

/** Short-lived in-memory cache so page loads aren't blocked by the external service. */
let risksCache: { risks: SafefliteRisk[]; fetchedAt: number } | null = null;
const RISKS_CACHE_TTL_MS = 60_000;

/**
 * Fetch the live SafeFLITE risk register. Returns an empty array if the secret
 * is not configured or the call fails (non-blocking). Results are cached in
 * memory for 60s and the request times out after 5s.
 */
export async function listSafefliteRisks(): Promise<SafefliteRisk[]> {
  const secret = process.env.TRAINING_CONTROL_SECRET;

  if (!secret) {
    console.warn("TRAINING_CONTROL_SECRET not configured, skipping SafeFLITE risk fetch");
    return [];
  }

  if (risksCache && Date.now() - risksCache.fetchedAt < RISKS_CACHE_TTL_MS) {
    return risksCache.risks;
  }

  try {
    const response = await fetch(`${SAFEFLITE_FUNCTIONS_BASE}/list-risks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeFLITE list-risks failed (${response.status}):`, errorText);
      return risksCache?.risks ?? [];
    }

    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.risks)) {
      console.error("SafeFLITE list-risks returned unexpected payload:", data);
      return risksCache?.risks ?? [];
    }

    const risks = data.risks as SafefliteRisk[];
    risksCache = { risks, fetchedAt: Date.now() };
    return risks;
  } catch (error) {
    console.error("SafeFLITE list-risks error:", error);
    // Serve stale cache rather than nothing if the external service is down
    return risksCache?.risks ?? [];
  }
}

/**
 * Push a course's training-control snapshot to SafeFLITE. Idempotent on
 * external_id. Logs failures without throwing so course saves never break.
 */
export async function upsertTrainingControl(
  payload: UpsertTrainingControlPayload
): Promise<void> {
  const secret = process.env.TRAINING_CONTROL_SECRET;

  if (!secret) {
    console.warn("TRAINING_CONTROL_SECRET not configured, skipping SafeFLITE control sync");
    return;
  }

  try {
    const response = await fetch(`${SAFEFLITE_FUNCTIONS_BASE}/upsert-training-control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      // Hard timeout: hung outbound fetches pile up and wedge the VM (Aug 2026).
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        external_id: payload.external_id,
        course_title: payload.course_title,
        course_status: payload.course_status,
        preview_url: payload.preview_url,
        risk_ids: payload.risk_ids,
        archived: payload.archived ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeFLITE control sync failed (${response.status}):`, errorText);
    } else {
      // Consume the body so undici releases the socket.
      await response.arrayBuffer().catch(() => {});
      console.log(`SafeFLITE control sync successful for course: ${payload.external_id}`);
    }
  } catch (error) {
    console.error("SafeFLITE control sync error:", error);
  }
}
