// @ts-nocheck
// lib/authorizations/auto-fix.ts
//
// Shared logic for automatically fixing "stuck" authorisation assignments.
// An assignment is stuck when its status does not match the learner's actual
// course completion progress:
//   - all linked courses completed  -> should be "pending_approval"
//   - some linked courses completed -> should be "in_progress"
//   - no linked courses completed   -> should be "assigned"
//
// Used by:
//   - Event triggers when a course assignment is marked completed
//     (app/api/assignment/progress, app/api/courses/[courseId]/complete)
//   - The scheduled safety-net sweep (app/api/authorization-auto-fix)
//   - Wired into the master cron hub (app/api/notifications/run-all)
//
// Only assignments currently in "assigned" or "in_progress" are touched, and
// the fix is advance-only: assigned -> in_progress -> pending_approval.
// Statuses are never moved backward (e.g. a module rejection legitimately
// resets an assignment to in_progress even with no completed courses), and
// pending_approval/completed/approved are never demoted.
// Archived users are excluded.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/dispatcher";

const FIXABLE_STATUSES = ["assigned", "in_progress"];

// Advance-only ordering: never move an assignment backward automatically.
const STATUS_RANK: Record<string, number> = {
  assigned: 0,
  in_progress: 1,
  pending_approval: 2,
};

function chunk<T>(arr: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type AutoFixDetail = {
  assignmentId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  authorisationId: string;
  authorisationTitle?: string;
  fromStatus: string;
  toStatus: string;
  progress: string; // e.g. "3/4"
};

export type AutoFixResult = {
  checked: number;
  fixed: AutoFixDetail[];
  errors: string[];
};

/**
 * Core auto-fix. Evaluates authorisation assignments (optionally scoped to a
 * single user) and updates any whose status doesn't match actual course
 * completion progress. Sends "pending approval" notifications to
 * Authorization Approvers when an assignment becomes ready for approval.
 */
export async function autoFixAuthorisationAssignments(options: {
  userId?: string | null;
  notifyApprovers?: boolean;
  trigger?: string;
} = {}): Promise<AutoFixResult> {
  const { userId = null, notifyApprovers = true, trigger = "sweep" } = options;
  const sb = supabaseAdmin();
  const result: AutoFixResult = { checked: 0, fixed: [], errors: [] };

  try {
    // 1) Fetch candidate assignments (only statuses we're allowed to move)
    let query = sb
      .from("authorisation_assignments")
      .select("id, user_id, authorisation_id, assignment_status")
      .eq("role", "trainee")
      .in("assignment_status", FIXABLE_STATUSES);
    if (userId) query = query.eq("user_id", userId);

    const { data: assignments, error: assignError } = await query;
    if (assignError) {
      result.errors.push(`Failed to fetch authorisation assignments: ${assignError.message}`);
      return result;
    }
    if (!assignments || assignments.length === 0) return result;

    // 2) Exclude archived users
    const allUserIds = [...new Set(assignments.map((a) => a.user_id))];
    const archivedIds = new Set<string>();
    for (const ids of chunk(allUserIds)) {
      const { data: profs, error: profErr } = await sb
        .from("profiles")
        .select("id, archived_at")
        .in("id", ids);
      if (profErr) {
        result.errors.push(`Failed to fetch profiles: ${profErr.message}`);
        return result;
      }
      (profs || []).forEach((p) => {
        if (p.archived_at) archivedIds.add(p.id);
      });
    }
    const activeAssignments = assignments.filter((a) => !archivedIds.has(a.user_id));
    result.checked = activeAssignments.length;
    if (activeAssignments.length === 0) return result;

    // 3) Batch-fetch linked courses for all authorisations involved
    const authIds = [...new Set(activeAssignments.map((a) => a.authorisation_id))];
    const authCoursesMap = new Map<string, string[]>();
    for (const ids of chunk(authIds)) {
      const { data: authCourses, error: acErr } = await sb
        .from("authorisation_courses")
        .select("authorisation_id, course_id")
        .in("authorisation_id", ids);
      if (acErr) {
        result.errors.push(`Failed to fetch authorisation courses: ${acErr.message}`);
        return result;
      }
      (authCourses || []).forEach((ac) => {
        if (!authCoursesMap.has(ac.authorisation_id)) authCoursesMap.set(ac.authorisation_id, []);
        authCoursesMap.get(ac.authorisation_id).push(ac.course_id);
      });
    }

    // 4) Batch-fetch completed course assignments for all users involved
    const allCourseIds = [...new Set([...authCoursesMap.values()].flat())];
    const activeUserIds = [...new Set(activeAssignments.map((a) => a.user_id))];
    const completedSet = new Set<string>(); // "userId:courseId"
    for (const uids of chunk(activeUserIds, 100)) {
      for (const cids of chunk(allCourseIds, 200)) {
        const { data: completed, error: caErr } = await sb
          .from("course_assignments")
          .select("user_id, course_id")
          .eq("role", "trainee")
          .eq("assignment_status", "completed")
          .in("user_id", uids)
          .in("course_id", cids);
        if (caErr) {
          result.errors.push(`Failed to fetch course assignments: ${caErr.message}`);
          return result;
        }
        (completed || []).forEach((c) => completedSet.add(`${c.user_id}:${c.course_id}`));
      }
    }

    // 5) Compute expected status and apply fixes
    for (const assignment of activeAssignments) {
      const courseIds = authCoursesMap.get(assignment.authorisation_id) || [];
      if (courseIds.length === 0) continue; // nothing to evaluate against

      const completedCount = courseIds.filter((cid) =>
        completedSet.has(`${assignment.user_id}:${cid}`)
      ).length;

      let expectedStatus = "assigned";
      if (completedCount === courseIds.length) expectedStatus = "pending_approval";
      else if (completedCount > 0) expectedStatus = "in_progress";

      // Advance-only: skip if expected status isn't ahead of the current one
      const currentRank = STATUS_RANK[assignment.assignment_status] ?? 0;
      const expectedRank = STATUS_RANK[expectedStatus] ?? 0;
      if (expectedRank <= currentRank) continue;

      const updatePayload: Record<string, any> = { assignment_status: expectedStatus };
      if (expectedStatus === "pending_approval") {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data: updatedRows, error: updateError } = await sb
        .from("authorisation_assignments")
        .update(updatePayload)
        .eq("id", assignment.id)
        // Guard against races: only update if still in the status we evaluated
        .eq("assignment_status", assignment.assignment_status)
        .select("id");

      if (updateError) {
        result.errors.push(
          `Failed to update assignment ${assignment.id} (${assignment.assignment_status} -> ${expectedStatus}): ${updateError.message}`
        );
        continue;
      }

      // 0 rows updated means another process changed the status first (race
      // lost) — don't count it as fixed and don't notify for it.
      if (!updatedRows || updatedRows.length === 0) continue;

      result.fixed.push({
        assignmentId: assignment.id,
        userId: assignment.user_id,
        authorisationId: assignment.authorisation_id,
        fromStatus: assignment.assignment_status,
        toStatus: expectedStatus,
        progress: `${completedCount}/${courseIds.length}`,
      });
    }

    if (result.fixed.length === 0) return result;

    // 6) Enrich fixes with user names and authorisation titles
    const fixedUserIds = [...new Set(result.fixed.map((f) => f.userId))];
    const fixedAuthIds = [...new Set(result.fixed.map((f) => f.authorisationId))];

    const profileMap = new Map();
    for (const ids of chunk(fixedUserIds)) {
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      (profs || []).forEach((p) => profileMap.set(p.id, p));
    }
    const authMap = new Map();
    for (const ids of chunk(fixedAuthIds)) {
      const { data: auths } = await sb.from("authorisations").select("id, title").in("id", ids);
      (auths || []).forEach((a) => authMap.set(a.id, a));
    }
    result.fixed = result.fixed.map((f) => ({
      ...f,
      userName: profileMap.get(f.userId)?.full_name || profileMap.get(f.userId)?.email || "Unknown",
      userEmail: profileMap.get(f.userId)?.email || "",
      authorisationTitle: authMap.get(f.authorisationId)?.title || "Unknown",
    }));

    // 7) Notify Authorization Approvers for assignments now pending approval
    const pendingFixes = result.fixed.filter((f) => f.toStatus === "pending_approval");
    if (notifyApprovers && pendingFixes.length > 0) {
      try {
        const approverIds = await getRoleUserIds(sb, ["Authorization Approver"]);
        const today = new Date().toISOString().split("T")[0];
        for (const fix of pendingFixes) {
          for (const approverId of approverIds) {
            try {
              await notifyUser(
                approverId,
                "authorisation_pending_approval",
                {
                  title: "Authorisation Pending Approval",
                  authorizationTitle: fix.authorisationTitle,
                  learnerName: fix.userName,
                  learner_email: fix.userEmail,
                  assignmentId: fix.assignmentId,
                  url: `/app/admin/review/${fix.assignmentId}`,
                },
                // Dedupe per assignment per day so event trigger + sweep don't double-notify
                { eventId: `auth_pending_${fix.assignmentId}_${today}` }
              );
            } catch (e) {
              console.error(`[auto-fix] Failed to notify approver ${approverId}:`, e);
            }
          }
        }
      } catch (e) {
        console.error("[auto-fix] Approver notification step failed:", e);
      }
    }

    console.log(
      `[auto-fix] trigger=${trigger} checked=${result.checked} fixed=${result.fixed.length} errors=${result.errors.length}`
    );
    return result;
  } catch (e: any) {
    console.error("[auto-fix] Unexpected error:", e);
    result.errors.push(e?.message || "Unexpected error");
    return result;
  }
}

/** Look up non-archived user ids holding any of the given role names. */
async function getRoleUserIds(sb, roleNames: string[]): Promise<string[]> {
  const { data: roles } = await sb.from("roles").select("id, name").in("name", roleNames);
  const roleIds = (roles || []).map((r) => r.id);
  if (roleIds.length === 0) return [];

  const { data: userRoles } = await sb.from("user_roles").select("user_id").in("role_id", roleIds);
  const userIds = [...new Set((userRoles || []).map((ur) => ur.user_id))];
  if (userIds.length === 0) return [];

  const active: string[] = [];
  for (const ids of chunk(userIds)) {
    const { data: profs } = await sb.from("profiles").select("id, archived_at").in("id", ids);
    (profs || []).forEach((p) => {
      if (!p.archived_at) active.push(p.id);
    });
  }
  return active;
}

/**
 * Full safety-net sweep across all users. When fixes were made, sends a short
 * "auto-fixed" summary to Admin and Senior Management users so the automatic
 * corrections stay visible.
 */
export async function runAuthorizationAutoFixSweep(options: {
  notifyAdmins?: boolean;
} = {}): Promise<AutoFixResult> {
  const { notifyAdmins = true } = options;
  const result = await autoFixAuthorisationAssignments({ trigger: "sweep" });

  if (notifyAdmins && result.fixed.length > 0) {
    try {
      const sb = supabaseAdmin();
      const adminIds = await getRoleUserIds(sb, ["Admin", "Senior Management"]);

      const summaryLines = [
        `🔧 Automatic authorisation fix (${result.fixed.length} corrected):`,
        ...result.fixed
          .slice(0, 50)
          .map(
            (f) =>
              `• ${f.authorisationTitle} - ${f.userName} (${f.fromStatus} → ${f.toStatus}, courses ${f.progress})`
          ),
      ];
      if (result.fixed.length > 50) {
        summaryLines.push(`…and ${result.fixed.length - 50} more`);
      }

      const runStamp = new Date().toISOString();
      for (const adminId of adminIds) {
        try {
          await notifyUser(
            adminId,
            "auth_autofix_report",
            {
              title: "Automatic Authorisation Fix Report",
              count: result.fixed.length,
              summary: summaryLines,
              url: `/app/admin/diagnose-authorizations`,
            },
            { eventId: `auth_autofix_${adminId}_${runStamp}` }
          );
        } catch (e) {
          console.error(`[auto-fix] Failed to send admin summary to ${adminId}:`, e);
        }
      }
    } catch (e) {
      console.error("[auto-fix] Admin summary step failed:", e);
    }
  }

  return result;
}
