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
