// @ts-nocheck
// lib/documents/replacement-side-effects.ts
//
// Shared side-effects for learner document replacement.
//
// When a learner replaces a document in a course (old row marked
// status='replaced', new active row inserted), any previous onsite
// assessment sign-off and authorisation approval based on the old document
// are no longer valid. This handler:
//
//   1. Clears the learner's onsite assessment completion for the course
//      (deletes the assignment_progress row for onsite_assessment modules)
//      and rolls the course assignment's aggregate 'completed' status back
//      to 'in_progress' so the course reads as requiring onsite assessment.
//   2. Reverts any completed/approved authorisation assignment (for
//      authorisations that include the course) back to 'pending_approval'.
//      The stored expiry date, approval metadata and restrictions are left
//      untouched — they are overwritten by the existing approval flow when
//      the reviewer re-approves (which recalculates expiry from the newest
//      active document).
//   3. Writes a user audit trail entry for each reverted authorisation.
//   4. Notifies reviewers (Admin + Senior Management roles) in-app and via
//      Teams bot DM that a new pending review is required.
//
// Invoked from:
//   - app/api/document-replaced/route.ts (learner course-page upload flow)
//   - app/api/requirement-responses-upload/route.ts (onsite requirement uploads)
//
// Courses without an onsite assessment module, or not linked to any
// authorisation, simply skip the inapplicable parts.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { logUserAudit } from "@/lib/audit";

const REVIEWER_ROLES = ["Admin", "Senior Management"];

export type ReplacementSideEffectsResult = {
  onsiteAssessmentReset: boolean;
  courseAssignmentReverted: boolean;
  revertedAuthorisations: Array<{ assignmentId: string; authorisationId: string; title: string }>;
  errors: string[];
};

export async function handleDocumentReplacement(opts: {
  /** The learner whose document was replaced. */
  userId: string;
  /** Course the replaced document belongs to. */
  courseId: string;
  /** Title of the newly uploaded (replacement) document. */
  documentTitle?: string | null;
  /** ID of the newly inserted active learner_documents row (used for notification dedupe). */
  documentId?: string | null;
  /** Who performed the replacement (learner or trainer/assessor). */
  actorId?: string | null;
}): Promise<ReplacementSideEffectsResult> {
  const { userId, courseId, documentTitle = null, documentId = null, actorId = null } = opts;
  const sb = supabaseAdmin();
  const result: ReplacementSideEffectsResult = {
    onsiteAssessmentReset: false,
    courseAssignmentReverted: false,
    revertedAuthorisations: [],
    errors: [],
  };

  if (!userId || !courseId) {
    result.errors.push("handleDocumentReplacement: missing userId or courseId");
    return result;
  }

  try {
    // ---- Context lookups (course title + learner name for messages) ----
    const [{ data: course }, { data: learner }] = await Promise.all([
      sb.from("courses").select("title").eq("id", courseId).maybeSingle(),
      sb.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    ]);
    const courseTitle = course?.title || "Unknown Course";
    const learnerName = learner?.full_name || learner?.email || "Unknown";

    // ---- 1) Reset onsite assessment completion ----
    const { data: onsiteModules, error: modErr } = await sb
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("type", "onsite_assessment");
    if (modErr) result.errors.push(`Failed to fetch onsite assessment modules: ${modErr.message}`);

    const { data: courseAssignments, error: caErr } = await sb
      .from("course_assignments")
      .select("id, assignment_status")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee");
    if (caErr) result.errors.push(`Failed to fetch course assignments: ${caErr.message}`);

    const assignmentIds = (courseAssignments || []).map((a) => a.id);
    const onsiteModuleIds = (onsiteModules || []).map((m) => m.id);

    if (assignmentIds.length > 0 && onsiteModuleIds.length > 0) {
      // Clear the onsite assessment completion record(s)
      const { data: deleted, error: delErr } = await sb
        .from("assignment_progress")
        .delete()
        .in("assignment_id", assignmentIds)
        .in("module_id", onsiteModuleIds)
        .select("id");
      if (delErr) {
        result.errors.push(`Failed to clear onsite assessment progress: ${delErr.message}`);
      } else if (deleted && deleted.length > 0) {
        result.onsiteAssessmentReset = true;
      }

      // Roll back the aggregate completed status so the course reads as
      // requiring onsite assessment again. Only demote 'completed'.
      const completedAssignmentIds = (courseAssignments || [])
        .filter((a) => a.assignment_status === "completed")
        .map((a) => a.id);
      if (completedAssignmentIds.length > 0) {
        const { data: reverted, error: revErr } = await sb
          .from("course_assignments")
          .update({ assignment_status: "in_progress", completed_at: null })
          .in("id", completedAssignmentIds)
          .eq("assignment_status", "completed")
          .select("id");
        if (revErr) {
          result.errors.push(`Failed to revert course assignment status: ${revErr.message}`);
        } else if (reverted && reverted.length > 0) {
          result.courseAssignmentReverted = true;
        }
      }
    }

    // ---- 2) Revert authorisation assignments to pending approval ----
    const { data: authCourses, error: acErr } = await sb
      .from("authorisation_courses")
      .select("authorisation_id")
      .eq("course_id", courseId);
    if (acErr) result.errors.push(`Failed to fetch authorisation courses: ${acErr.message}`);

    const authIds = [...new Set((authCourses || []).map((ac) => ac.authorisation_id))];
    if (authIds.length > 0) {
      const { data: authAssignments, error: aaErr } = await sb
        .from("authorisation_assignments")
        .select("id, authorisation_id, assignment_status, authorisations(title)")
        .eq("user_id", userId)
        .eq("role", "trainee")
        .in("authorisation_id", authIds)
        .eq("assignment_status", "completed");
      if (aaErr) result.errors.push(`Failed to fetch authorisation assignments: ${aaErr.message}`);

      for (const assignment of authAssignments || []) {
        // Only flip the status. Expiry date, approval metadata and
        // restrictions stay untouched until re-approval overwrites them.
        const { data: updated, error: updErr } = await sb
          .from("authorisation_assignments")
          .update({ assignment_status: "pending_approval" })
          .eq("id", assignment.id)
          .eq("assignment_status", "completed")
          .select("id");
        if (updErr) {
          result.errors.push(`Failed to revert authorisation assignment ${assignment.id}: ${updErr.message}`);
          continue;
        }
        if (!updated || updated.length === 0) continue; // race lost

        const authTitle = assignment.authorisations?.title || "Unknown";
        result.revertedAuthorisations.push({
          assignmentId: assignment.id,
          authorisationId: assignment.authorisation_id,
          title: authTitle,
        });

        // ---- 3) Audit trail ----
        await logUserAudit({
          userId,
          actorId,
          action: "authorisation_review_retriggered",
          details: {
            authorisation_id: assignment.authorisation_id,
            authorisation_title: authTitle,
            course_id: courseId,
            course_title: courseTitle,
            document_title: documentTitle,
            reason: "document_replaced",
            from_status: "completed",
            to_status: "pending_approval",
          },
        });
      }
    }

    // ---- 4) Notify reviewers (Admin + Senior Management) ----
    if (result.revertedAuthorisations.length > 0) {
      const reviewerIds = await getReviewerUserIds(sb);
      for (const reverted of result.revertedAuthorisations) {
        const dedupeKey = `doc_replaced_review_${reverted.assignmentId}_${documentId || new Date().toISOString().split("T")[0]}`;
        for (const reviewerId of reviewerIds) {
          try {
            await notifyUser(
              reviewerId,
              "document_replaced_review_required",
              {
                title: "Document Replaced - Review Required",
                learnerName,
                learner_email: learner?.email || "",
                courseTitle,
                documentName: documentTitle || "Document",
                authorizationTitle: reverted.title,
                assignmentId: reverted.assignmentId,
                url: `/app/admin/review/${reverted.assignmentId}`,
              },
              { eventId: dedupeKey }
            );
          } catch (e) {
            console.error(`[doc-replaced] Failed to notify reviewer ${reviewerId}:`, e);
          }
        }
      }
    }

    console.log(
      `[doc-replaced] user=${userId} course=${courseId} onsiteReset=${result.onsiteAssessmentReset} ` +
        `courseReverted=${result.courseAssignmentReverted} authsReverted=${result.revertedAuthorisations.length} errors=${result.errors.length}`
    );
    return result;
  } catch (e: any) {
    console.error("[doc-replaced] Unexpected error:", e);
    result.errors.push(e?.message || "Unexpected error");
    return result;
  }
}

/**
 * Post-transaction follow-ups for a document replacement whose durable state
 * changes (onsite reset + authorisation reverts) already happened inside the
 * replace_learner_document DB transaction: write the audit trail and notify
 * reviewers. Best-effort — the required re-review state is already committed,
 * so failures here are collected and reported, never silently swallowed.
 */
export async function auditAndNotifyDocumentReplacement(opts: {
  userId: string;
  courseId: string;
  courseTitle?: string | null;
  documentTitle?: string | null;
  documentId?: string | null;
  actorId?: string | null;
  revertedAuthorisations: Array<{ assignmentId: string; authorisationId: string; title: string }>;
}): Promise<{ errors: string[] }> {
  const {
    userId,
    courseId,
    courseTitle: courseTitleIn = null,
    documentTitle = null,
    documentId = null,
    actorId = null,
    revertedAuthorisations,
  } = opts;
  const errors: string[] = [];
  if (!revertedAuthorisations || revertedAuthorisations.length === 0) return { errors };

  const sb = supabaseAdmin();
  try {
    const [{ data: course }, { data: learner }] = await Promise.all([
      courseTitleIn
        ? Promise.resolve({ data: { title: courseTitleIn } })
        : sb.from("courses").select("title").eq("id", courseId).maybeSingle(),
      sb.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    ]);
    const courseTitle = course?.title || "Unknown Course";
    const learnerName = learner?.full_name || learner?.email || "Unknown";

    for (const reverted of revertedAuthorisations) {
      try {
        await logUserAudit({
          userId,
          actorId,
          action: "authorisation_review_retriggered",
          details: {
            authorisation_id: reverted.authorisationId,
            authorisation_title: reverted.title,
            course_id: courseId,
            course_title: courseTitle,
            document_title: documentTitle,
            reason: "document_replaced",
            from_status: "completed",
            to_status: "pending_approval",
          },
        });
      } catch (e: any) {
        errors.push(`Audit log failed for authorisation ${reverted.authorisationId}: ${e?.message || e}`);
      }
    }

    const reviewerIds = await getReviewerUserIds(sb);
    for (const reverted of revertedAuthorisations) {
      const dedupeKey = `doc_replaced_review_${reverted.assignmentId}_${documentId || new Date().toISOString().split("T")[0]}`;
      for (const reviewerId of reviewerIds) {
        try {
          await notifyUser(
            reviewerId,
            "document_replaced_review_required",
            {
              title: "Document Replaced - Review Required",
              learnerName,
              learner_email: learner?.email || "",
              courseTitle,
              documentName: documentTitle || "Document",
              authorizationTitle: reverted.title,
              assignmentId: reverted.assignmentId,
              url: `/app/admin/review/${reverted.assignmentId}`,
            },
            { eventId: dedupeKey }
          );
        } catch (e: any) {
          errors.push(`Failed to notify reviewer ${reviewerId}: ${e?.message || e}`);
          console.error(`[doc-replaced] Failed to notify reviewer ${reviewerId}:`, e);
        }
      }
    }
  } catch (e: any) {
    errors.push(e?.message || "Unexpected error in auditAndNotifyDocumentReplacement");
    console.error("[doc-replaced] auditAndNotify unexpected error:", e);
  }
  return { errors };
}

/** Non-archived users holding any of the reviewer roles. */
async function getReviewerUserIds(sb): Promise<string[]> {
  const { data: roles } = await sb.from("roles").select("id, name").in("name", REVIEWER_ROLES);
  const roleIds = (roles || []).map((r) => r.id);
  if (roleIds.length === 0) return [];

  const { data: userRoles } = await sb.from("user_roles").select("user_id").in("role_id", roleIds);
  const userIds = [...new Set((userRoles || []).map((ur) => ur.user_id))];
  if (userIds.length === 0) return [];

  const { data: profs } = await sb.from("profiles").select("id, archived_at").in("id", userIds);
  return (profs || []).filter((p) => !p.archived_at).map((p) => p.id);
}
