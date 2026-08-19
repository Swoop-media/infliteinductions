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

// Supabase (PostgREST) silently caps results at 1000 rows per request with no
// error. Any potentially-large select must page with .range() (deterministic
// ordering) until a short page, or the result set silently truncates.
const PAGE_SIZE = 1000;
async function fetchAllRows(makeQuery: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
  }
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

export type BackfillDetail = {
  authorisationId: string;
  authorisationTitle?: string;
  courseId: string;
  courseTitle?: string;
  userId: string;
  userName?: string;
};

export type BackfillResult = {
  checked: number; // active trainee authorisation assignments evaluated
  inserted: BackfillDetail[];
  errors: string[];
};

/**
 * Safety-net backfill: for every active (assigned/in_progress/pending_approval,
 * non-archived) trainee authorisation assignment, ensure a trainee
 * course_assignments row exists for every linked *published* course.
 * Courses added to an authorisation after trainees were assigned historically
 * got no assignment rows, leaving learners at a silent dead end.
 * created_by is NOT NULL, so backfilled rows fall back to the trainee's own id.
 * Unique key is (course_id,user_id,role) — upsert with ignoreDuplicates.
 */
export async function backfillMissingCourseAssignments(): Promise<BackfillResult> {
  const sb = supabaseAdmin();
  const result: BackfillResult = { checked: 0, inserted: [], errors: [] };

  try {
    // 1) Active trainee authorisation assignments (explicit active allowlist —
    // expired/revoked must stay locked out). Paginated: there can be >1000.
    const assignments = await fetchAllRows(() =>
      sb
        .from("authorisation_assignments")
        .select("id, user_id, authorisation_id")
        .eq("role", "trainee")
        .in("assignment_status", ["assigned", "in_progress", "pending_approval"])
        .order("id")
    );
    if (assignments.length === 0) return result;

    // 2) Exclude archived users
    const allUserIds = [...new Set(assignments.map((a) => a.user_id))];
    const archivedIds = new Set<string>();
    for (const ids of chunk(allUserIds, 150)) {
      const { data: profs, error: pErr } = await sb
        .from("profiles")
        .select("id, archived_at")
        .in("id", ids);
      if (pErr) {
        result.errors.push(`Failed to fetch profiles: ${pErr.message}`);
        return result;
      }
      (profs || []).forEach((p) => {
        if (p.archived_at) archivedIds.add(p.id);
      });
    }
    const active = assignments.filter((a) => !archivedIds.has(a.user_id));
    result.checked = active.length;
    if (active.length === 0) return result;

    // 3) Linked courses per authorisation (paginated: 150 authorisations can
    // link >1000 courses in total)
    const authIds = [...new Set(active.map((a) => a.authorisation_id))];
    const authCoursesMap = new Map<string, string[]>();
    for (const ids of chunk(authIds, 150)) {
      const acs = await fetchAllRows(() =>
        sb
          .from("authorisation_courses")
          .select("authorisation_id, course_id")
          .in("authorisation_id", ids)
          .order("authorisation_id")
          .order("course_id")
      );
      acs.forEach((ac) => {
        if (!authCoursesMap.has(ac.authorisation_id)) authCoursesMap.set(ac.authorisation_id, []);
        authCoursesMap.get(ac.authorisation_id).push(ac.course_id);
      });
    }

    // 4) Only backfill published courses (assignments to unpublished courses
    // strand learners).
    const allCourseIds = [...new Set([...authCoursesMap.values()].flat())];
    const publishedIds = new Set<string>();
    const courseTitleMap = new Map<string, string>();
    for (const ids of chunk(allCourseIds, 150)) {
      const { data: courses, error: cErr } = await sb
        .from("courses")
        .select("id, title, status")
        .in("id", ids);
      if (cErr) {
        result.errors.push(`Failed to fetch courses: ${cErr.message}`);
        return result;
      }
      (courses || []).forEach((c) => {
        courseTitleMap.set(c.id, c.title);
        if (c.status === "published") publishedIds.add(c.id);
      });
    }

    // 5) Existing trainee course assignments for the users involved
    const activeUserIds = [...new Set(active.map((a) => a.user_id))];
    const haveRow = new Set<string>(); // "userId:courseId"
    const relevantCourseIds = allCourseIds.filter((cid) => publishedIds.has(cid));
    for (const uids of chunk(activeUserIds, 50)) {
      for (const cids of chunk(relevantCourseIds, 100)) {
        // Paginated: a truncated "existing" set here would misreport rows as
        // missing (ignoreDuplicates would mask it, but the report would lie).
        const existing = await fetchAllRows(() =>
          sb
            .from("course_assignments")
            .select("id, user_id, course_id")
            .eq("role", "trainee")
            .in("user_id", uids)
            .in("course_id", cids)
            .order("id")
        );
        existing.forEach((r) => haveRow.add(`${r.user_id}:${r.course_id}`));
      }
    }

    // 6) Compute and insert missing rows
    const now = new Date().toISOString();
    const missing: { userId: string; courseId: string; authorisationId: string }[] = [];
    const seen = new Set<string>();
    for (const a of active) {
      const courseIds = authCoursesMap.get(a.authorisation_id) || [];
      for (const cid of courseIds) {
        if (!publishedIds.has(cid)) continue;
        const key = `${a.user_id}:${cid}`;
        if (haveRow.has(key) || seen.has(key)) continue;
        seen.add(key);
        missing.push({ userId: a.user_id, courseId: cid, authorisationId: a.authorisation_id });
      }
    }
    if (missing.length === 0) return result;

    for (const batch of chunk(missing, 200)) {
      const rows = batch.map((m) => ({
        user_id: m.userId,
        course_id: m.courseId,
        role: "trainee",
        assignment_status: "assigned",
        // created_by is NOT NULL; no acting user in a sweep, so use the
        // trainee's own id (same fallback as the creator-page backfill).
        created_by: m.userId,
        assigned_by: null,
        assigned_at: now,
        created_at: now,
      }));
      const { error: insErr } = await sb
        .from("course_assignments")
        .upsert(rows, { onConflict: "course_id,user_id,role", ignoreDuplicates: true });
      if (insErr) {
        result.errors.push(`Backfill insert failed: ${insErr.message}`);
        continue;
      }
      batch.forEach((m) =>
        result.inserted.push({
          authorisationId: m.authorisationId,
          courseId: m.courseId,
          courseTitle: courseTitleMap.get(m.courseId),
          userId: m.userId,
        })
      );
    }

    // 7) Enrich with user names and authorisation titles
    if (result.inserted.length > 0) {
      const insUserIds = [...new Set(result.inserted.map((i) => i.userId))];
      const insAuthIds = [...new Set(result.inserted.map((i) => i.authorisationId))];
      const profileMap = new Map();
      for (const ids of chunk(insUserIds, 150)) {
        const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
        (profs || []).forEach((p) => profileMap.set(p.id, p));
      }
      const authMap = new Map();
      for (const ids of chunk(insAuthIds, 150)) {
        const { data: auths } = await sb.from("authorisations").select("id, title").in("id", ids);
        (auths || []).forEach((a) => authMap.set(a.id, a));
      }
      result.inserted = result.inserted.map((i) => ({
        ...i,
        userName:
          profileMap.get(i.userId)?.full_name || profileMap.get(i.userId)?.email || "Unknown",
        authorisationTitle: authMap.get(i.authorisationId)?.title || "Unknown",
      }));
    }

    console.log(
      `[auto-fix] backfill checked=${result.checked} inserted=${result.inserted.length} errors=${result.errors.length}`
    );
    return result;
  } catch (e: any) {
    console.error("[auto-fix] Backfill unexpected error:", e);
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
} = {}): Promise<AutoFixResult & { backfill?: BackfillResult }> {
  const { notifyAdmins = true } = options;

  // First, backfill any missing trainee course_assignments rows for courses
  // linked to authorisations (courses added after trainees were assigned
  // historically got no rows — a silent learner dead end). Runs first so the
  // status fix below evaluates against the complete set of assignments.
  const backfill = await backfillMissingCourseAssignments();

  const result: AutoFixResult & { backfill?: BackfillResult } =
    await autoFixAuthorisationAssignments({ trigger: "sweep" });
  result.backfill = backfill;

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
