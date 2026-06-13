const SAFEFLITE_FUNCTIONS_BASE =
  "https://yakvuypqwqhdtkpgqdcf.supabase.co/functions/v1";

export interface SafefliteRisk {
  id: string;
  risk_code: string;
  title: string;
  is_enterprise: boolean;
  risk_kind: string;
  status: string;
}

export interface UpsertTrainingControlPayload {
  external_id: string;
  course_title: string;
  course_status?: string;
  preview_url: string;
  risk_ids: string[];
  archived?: boolean;
}

/**
 * Fetch the live SafeFLITE risk register. Returns an empty array if the secret
 * is not configured or the call fails (non-blocking).
 */
export async function listSafefliteRisks(): Promise<SafefliteRisk[]> {
  const secret = process.env.TRAINING_CONTROL_SECRET;

  if (!secret) {
    console.warn("TRAINING_CONTROL_SECRET not configured, skipping SafeFLITE risk fetch");
    return [];
  }

  try {
    const response = await fetch(`${SAFEFLITE_FUNCTIONS_BASE}/list-risks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeFLITE list-risks failed (${response.status}):`, errorText);
      return [];
    }

    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.risks)) {
      console.error("SafeFLITE list-risks returned unexpected payload:", data);
      return [];
    }

    return data.risks as SafefliteRisk[];
  } catch (error) {
    console.error("SafeFLITE list-risks error:", error);
    return [];
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
      console.log(`SafeFLITE control sync successful for course: ${payload.external_id}`);
    }
  } catch (error) {
    console.error("SafeFLITE control sync error:", error);
  }
}
