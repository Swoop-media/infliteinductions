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

export type ContentAuditAction =
  | "created"
  | "duplicated"
  | "updated"
  | "status_changed"
  // deeper course-content changes
  | "module_added"
  | "module_renamed"
  | "module_updated"
  | "module_removed"
  | "content_added"
  | "content_updated"
  | "content_removed"
  | "quiz_updated"
  | "question_added"
  | "question_updated"
  | "question_removed"
  | "option_added"
  | "option_updated"
  | "option_removed"
  | "requirement_added"
  | "requirement_updated"
  | "requirement_removed"
  | "equipment_added"
  | "equipment_updated"
  | "equipment_removed"
  // authorisation course links
  | "course_linked"
  | "course_unlinked";

export type ContentAuditEntry = {
  entityType: "course" | "authorisation";
  entityId?: string | null;
  entityName?: string | null;
  action: ContentAuditAction;
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

/**
 * Convenience wrapper for logging changes to content *inside* a module
 * (content blocks, quiz questions, onsite requirements, equipment, module
 * settings). Resolves the module's parent course so the entry appears under
 * the course in the Audit Trail, and records the module title in details.
 * Best-effort — never throws.
 */
export async function logModuleContentAudit(opts: {
  moduleId: string;
  action: ContentAuditAction;
  details?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
  /** Pre-resolved course info, to skip lookups when the caller already has it. */
  courseId?: string | null;
  courseTitle?: string | null;
  moduleTitle?: string | null;
}): Promise<void> {
  try {
    if (!opts?.moduleId || !opts?.action) return;
    const admin = supabaseAdmin();

    let courseId = opts.courseId ?? null;
    let moduleTitle = opts.moduleTitle ?? null;
    if (!courseId || !moduleTitle) {
      const { data: mod } = await admin
        .from("course_modules")
        .select("course_id, title, type")
        .eq("id", opts.moduleId)
        .maybeSingle();
      courseId = courseId || mod?.course_id || null;
      moduleTitle = moduleTitle || mod?.title || null;
    }

    let courseTitle = opts.courseTitle ?? null;
    if (!courseTitle && courseId) {
      const { data: course } = await admin
        .from("courses")
        .select("title")
        .eq("id", courseId)
        .maybeSingle();
      courseTitle = course?.title || null;
    }

    await logContentAudit({
      entityType: "course",
      entityId: courseId,
      entityName: courseTitle,
      action: opts.action,
      actorId: opts.actorId ?? null,
      actorName: opts.actorName ?? null,
      details: {
        ...(moduleTitle ? { module: moduleTitle } : {}),
        ...(opts.details ?? {}),
      },
    });
  } catch (e) {
    console.error("[audit] Unexpected module content audit error:", e);
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
