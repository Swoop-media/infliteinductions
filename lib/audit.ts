// @ts-nocheck
// Best-effort per-user audit logging. Writes go through the service-role
// client (user_audit_log is deny-all RLS). Never throws — if the table does
// not exist yet (migration 010 not applied) or the insert fails, we log to the
// console and carry on so the underlying admin action is never blocked.
import { supabaseAdmin } from "@/lib/supabase/admin";

export type UserAuditEntry = {
  userId: string;
  action: string;
  details?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
};

export type ContentAuditEntry = {
  entityType: "course" | "authorisation";
  entityId?: string | null;
  entityName?: string | null;
  action: "created" | "duplicated" | "updated" | "status_changed";
  details?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
};

/**
 * Diff two row snapshots limited to the keys of `patch`.
 * Returns { field: { from, to } } for fields that actually changed.
 */
export function diffChanges(
  oldRow: Record<string, any> | null | undefined,
  patch: Record<string, any>
): Record<string, { from: any; to: any }> {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(patch)) {
    if (key === "updated_at") continue;
    const before = oldRow ? oldRow[key] : undefined;
    const after = patch[key];
    const norm = (v: any) => (v === undefined || v === null || v === "" ? null : v);
    if (JSON.stringify(norm(before)) !== JSON.stringify(norm(after))) {
      changes[key] = { from: before ?? null, to: after ?? null };
    }
  }
  return changes;
}

/**
 * Best-effort audit logging for course/authorisation changes. Writes to
 * content_audit_log (deny-all RLS, service-role only). Never throws — if the
 * table does not exist yet (migration 012 not applied) we log and carry on.
 */
export async function logContentAudit(entry: ContentAuditEntry): Promise<void> {
  try {
    if (!entry?.entityType || !entry?.action) return;
    const admin = supabaseAdmin();

    let actorName = entry.actorName ?? null;
    if (!actorName && entry.actorId) {
      const { data: actorProfile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", entry.actorId)
        .maybeSingle();
      actorName = actorProfile?.full_name || actorProfile?.email || null;
    }

    const { error } = await admin.from("content_audit_log").insert({
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_name: entry.entityName ?? null,
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_name: actorName,
      details: entry.details ?? {},
    });
    if (error) {
      console.error("[audit] Failed to write content audit log:", error.message);
    }
  } catch (e) {
    console.error("[audit] Unexpected content audit logging error:", e);
  }
}

export async function logUserAudit(entry: UserAuditEntry): Promise<void> {
  try {
    if (!entry?.userId || !entry?.action) return;
    const admin = supabaseAdmin();

    let actorName = entry.actorName ?? null;
    if (!actorName && entry.actorId) {
      const { data: actorProfile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", entry.actorId)
        .maybeSingle();
      actorName = actorProfile?.full_name || actorProfile?.email || null;
    }

    const { error } = await admin.from("user_audit_log").insert({
      user_id: entry.userId,
      actor_id: entry.actorId ?? null,
      actor_name: actorName,
      action: entry.action,
      details: entry.details ?? {},
    });
    if (error) {
      console.error("[audit] Failed to write audit log:", error.message);
    }
  } catch (e) {
    console.error("[audit] Unexpected audit logging error:", e);
  }
}
