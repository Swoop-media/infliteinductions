// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";

export const IMMUTABLE_HISTORY_MIGRATION = "032_immutable_training_history.sql";

function migrationError(error: any): Error {
  const message = error?.message || String(error || "Unknown database error");
  if (
    message.includes("course_versions") ||
    message.includes("course_version_id") ||
    message.includes("attempt_number") ||
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    error?.code === "42703"
  ) {
    return new Error(
      `Immutable training history is not ready. Apply app/migrations/${IMMUTABLE_HISTORY_MIGRATION} before completing, retaking, or publishing course versions.`
    );
  }
  return new Error(message);
}

export async function recordAuthorisationCompletion(args: {
  assignmentId: string;
  completedAt?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  restrictions?: string | null;
  actorId?: string | null;
  reason?: string;
  adminClient?: any;
}) {
  const adminClient = args.adminClient || supabaseAdmin();
  const { data: assignment, error: assignmentError } = await adminClient
    .from("authorisation_assignments")
    .select("id, user_id, authorisation_id, role, assignment_status, completed_at, approved_at, approved_by, restrictions, expires_at, attempt_number")
    .eq("id", args.assignmentId)
    .eq("role", "trainee")
    .maybeSingle();
  if (assignmentError) throw migrationError(assignmentError);
  if (!assignment) throw new Error("Trainee authorisation assignment not found.");

  const attemptNumber = assignment.attempt_number || 1;
  const { data: existing, error: existingError } = await adminClient
    .from("authorisation_assignment_history")
    .select("id")
    .eq("assignment_id", assignment.id)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (existingError) throw migrationError(existingError);
  if (existing) return { id: existing.id, alreadyRecorded: true };

  const { data: snapshot, error: snapshotError } = await adminClient.rpc(
    "capture_authorisation_snapshot",
    { p_authorisation_id: assignment.authorisation_id }
  );
  if (snapshotError) throw migrationError(snapshotError);
  if (!snapshot) throw new Error("Could not capture the authorisation definition.");

  const courseIds = (snapshot.required_courses || [])
    .map((course: any) => course.course_id)
    .filter(Boolean);
  const approvedAt = args.approvedAt || assignment.approved_at || args.completedAt || assignment.completed_at || new Date().toISOString();

  const [courseHistoryResult, documentsResult] = await Promise.all([
    courseIds.length
      ? adminClient
          .from("course_assignment_history")
          .select("id, course_id, course_title, course_version_number, attempt_number, completed_at, snapshot_source")
          .eq("user_id", assignment.user_id)
          .in("course_id", courseIds)
          .lte("completed_at", approvedAt)
          .order("completed_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    courseIds.length
      ? adminClient
          .from("learner_documents")
          .select("*")
          .eq("user_id", assignment.user_id)
          .in("course_id", courseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (courseHistoryResult.error) throw new Error(courseHistoryResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  const completedAt = args.completedAt || assignment.completed_at || approvedAt;
  const { data: inserted, error: insertError } = await adminClient
    .from("authorisation_assignment_history")
    .insert({
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      authorisation_id: assignment.authorisation_id,
      assignment_status: "completed",
      completed_at: completedAt,
      approved_at: approvedAt,
      approved_by: args.actorId || assignment.approved_by || null,
      restrictions: args.restrictions !== undefined ? args.restrictions : assignment.restrictions,
      expires_at: args.expiresAt !== undefined ? args.expiresAt : assignment.expires_at,
      superseded_at: new Date().toISOString(),
      superseded_by: args.actorId || null,
      reason: args.reason || "completion",
      authorisation_title: snapshot.authorisation?.title || "Authorisation",
      snapshot,
      evidence: {
        schema_version: 1,
        captured_at: new Date().toISOString(),
        course_completion_records: courseHistoryResult.data || [],
        learner_documents: documentsResult.data || [],
      },
      attempt_number: attemptNumber,
      snapshot_source: "exact",
    })
    .select("id")
    .single();

  if (insertError?.code === "23505") {
    const { data: raced } = await adminClient
      .from("authorisation_assignment_history")
      .select("id")
      .eq("assignment_id", assignment.id)
      .eq("attempt_number", attemptNumber)
      .single();
    return { id: raced.id, alreadyRecorded: true };
  }
  if (insertError) throw migrationError(insertError);
  return { id: inserted.id, alreadyRecorded: false };
}

function quizIdsFromSnapshot(snapshot: any): string[] {
  const ids: string[] = [];
  for (const module of snapshot?.modules || []) {
    for (const quiz of module?.quizzes || []) {
      if (quiz?.id) ids.push(quiz.id);
    }
  }
  return ids;
}

export async function getCurrentCourseVersion(adminClient: any, courseId: string) {
  const { data, error } = await adminClient
    .from("course_versions")
    .select("id, course_id, version_number, title, description, snapshot, status, published_at")
    .eq("course_id", courseId)
    .in("status", ["published", "superseded"])
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw migrationError(error);
  if (!data) {
    throw new Error(
      `No immutable baseline exists for this course. Re-apply app/migrations/${IMMUTABLE_HISTORY_MIGRATION}.`
    );
  }
  return data;
}

/**
 * Saves one immutable learner-completion record. This function is idempotent:
 * an already-recorded assignment/version/attempt is returned without mutation.
 */
export async function recordCourseCompletion(args: {
  assignmentId: string;
  completedAt?: string;
  actorId?: string | null;
  reason?: "completion" | "retake" | "version_release" | string;
  adminClient?: any;
}) {
  const adminClient = args.adminClient || supabaseAdmin();
  const completedAt = args.completedAt || new Date().toISOString();

  const { data: assignment, error: assignmentError } = await adminClient
    .from("course_assignments")
    .select(
      "id, user_id, course_id, role, assignment_status, completed_at, assigned_at, course_version_id, attempt_number"
    )
    .eq("id", args.assignmentId)
    .eq("role", "trainee")
    .maybeSingle();
  if (assignmentError) throw migrationError(assignmentError);
  if (!assignment) throw new Error("Trainee course assignment not found.");

  let versionId = assignment.course_version_id;
  let version: any = null;
  if (versionId) {
    const { data, error } = await adminClient
      .from("course_versions")
      .select("id, version_number, title, snapshot, published_at")
      .eq("id", versionId)
      .maybeSingle();
    if (error) throw migrationError(error);
    version = data;
  }
  if (!version) {
    version = await getCurrentCourseVersion(adminClient, assignment.course_id);
    versionId = version.id;
    const { error: linkError } = await adminClient
      .from("course_assignments")
      .update({ course_version_id: versionId })
      .eq("id", assignment.id);
    if (linkError) throw migrationError(linkError);
  }

  const attemptNumber = assignment.attempt_number || 1;
  const { data: existing, error: existingError } = await adminClient
    .from("course_assignment_history")
    .select("id")
    .eq("assignment_id", assignment.id)
    .eq("course_version_id", versionId)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (existingError) throw migrationError(existingError);
  if (existing) return { id: existing.id, alreadyRecorded: true };

  // Completion-time writes freeze the live content (including small edits that
  // intentionally did not trigger a retake). A retrospective safety snapshot
  // during reset/release must use the pinned release definition so later edits
  // can never be mislabeled as the older version.
  const isCompletionTimeCapture =
    !args.reason || args.reason === "completion" || args.reason === "status_repair";
  let courseSnapshot = version.snapshot;
  let snapshotSource = "release_fallback";
  if (isCompletionTimeCapture) {
    const { data, error } = await adminClient.rpc(
      "capture_course_version_snapshot",
      { p_course_id: assignment.course_id }
    );
    if (error) throw migrationError(error);
    if (!data) throw new Error("Could not capture the course content at completion.");
    courseSnapshot = data;
    snapshotSource = "exact";
  }

  const quizIds = quizIdsFromSnapshot(courseSnapshot);
  const [
    progressResult,
    requirementResult,
    equipmentResponseResult,
    equipmentAssessmentResult,
    documentsResult,
    quizAttemptsResult,
  ] = await Promise.all([
    adminClient.from("assignment_progress").select("*").eq("assignment_id", assignment.id),
    adminClient
      .from("requirement_responses")
      .select("*")
      .eq("assignment_id", assignment.id),
    adminClient
      .from("trainee_equipment_responses")
      .select("*")
      .eq("user_id", assignment.user_id)
      .eq("course_id", assignment.course_id),
    adminClient
      .from("equipment_assessments")
      .select("*")
      .eq("trainee_id", assignment.user_id)
      .eq("course_id", assignment.course_id),
    adminClient
      .from("learner_documents")
      .select("*")
      .eq("user_id", assignment.user_id)
      .eq("course_id", assignment.course_id),
    quizIds.length
      ? adminClient
          .from("quiz_attempts")
          .select("*")
          .eq("user_id", assignment.user_id)
          .in("quiz_id", quizIds)
          .or(
            `assignment_id.eq.${assignment.id},and(assignment_id.is.null,created_at.gte.${assignment.assigned_at || "1970-01-01T00:00:00Z"})`
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [
    progressResult,
    requirementResult,
    equipmentResponseResult,
    equipmentAssessmentResult,
    documentsResult,
    quizAttemptsResult,
  ]) {
    if (result?.error) throw new Error(`Could not capture learner evidence: ${result.error.message}`);
  }

  const evidence = {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    assignment: {
      id: assignment.id,
      assigned_at: assignment.assigned_at,
      completed_at: completedAt,
      attempt_number: attemptNumber,
    },
    assignment_progress: progressResult.data || [],
    quiz_attempts: quizAttemptsResult.data || [],
    requirement_responses: requirementResult.data || [],
    trainee_equipment_responses: equipmentResponseResult.data || [],
    equipment_assessments: equipmentAssessmentResult.data || [],
    learner_documents: documentsResult.data || [],
  };

  const { data: inserted, error: insertError } = await adminClient
    .from("course_assignment_history")
    .insert({
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      course_id: assignment.course_id,
      assignment_status: "completed",
      completed_at: completedAt,
      superseded_at: new Date().toISOString(),
      superseded_by: args.actorId || null,
      reason: args.reason || "completion",
      course_version_id: versionId,
      course_version_number: version.version_number,
      attempt_number: attemptNumber,
      course_title: courseSnapshot.course?.title || version.title,
      snapshot: courseSnapshot,
      evidence,
      snapshot_source: snapshotSource,
    })
    .select("id")
    .single();

  // A concurrent completion request may have inserted the same immutable row.
  if (insertError?.code === "23505") {
    const { data: raced } = await adminClient
      .from("course_assignment_history")
      .select("id")
      .eq("assignment_id", assignment.id)
      .eq("course_version_id", versionId)
      .eq("attempt_number", attemptNumber)
      .single();
    return { id: raced.id, alreadyRecorded: true };
  }
  if (insertError) throw migrationError(insertError);
  return { id: inserted.id, alreadyRecorded: false };
}

/**
 * Creates the next immutable course definition and moves every trainee
 * assignment to that version. It is retry-safe: a half-finished publishing row
 * is resumed rather than creating another version.
 */
export async function publishNewCourseVersion(args: {
  courseId: string;
  actorId: string;
  changeNotes?: string | null;
}) {
  const adminClient = supabaseAdmin();
  const { data: course, error: courseError } = await adminClient
    .from("courses")
    .select("id, title, description, status, current_version_number")
    .eq("id", args.courseId)
    .maybeSingle();
  if (courseError) throw migrationError(courseError);
  if (!course) throw new Error("Course not found.");
  if (course.status !== "published") {
    throw new Error("Only a published course can release a new required version.");
  }

  const currentVersionNumber = course.current_version_number || 1;
  const nextVersionNumber = currentVersionNumber + 1;
  const { data: snapshot, error: snapshotError } = await adminClient.rpc(
    "capture_course_version_snapshot",
    { p_course_id: course.id }
  );
  if (snapshotError) throw migrationError(snapshotError);
  if (!snapshot) throw new Error("Could not capture the course definition.");

  let { data: nextVersion, error: nextVersionError } = await adminClient
    .from("course_versions")
    .select("id, version_number, status")
    .eq("course_id", course.id)
    .eq("version_number", nextVersionNumber)
    .maybeSingle();
  if (nextVersionError) throw migrationError(nextVersionError);

  if (!nextVersion) {
    const created = await adminClient
      .from("course_versions")
      .insert({
        course_id: course.id,
        version_number: nextVersionNumber,
        title: course.title || "Untitled course",
        description: course.description,
        snapshot,
        status: "publishing",
        change_notes: args.changeNotes || null,
        published_by: args.actorId,
        published_at: new Date().toISOString(),
      })
      .select("id, version_number, status")
      .single();
    if (created.error) throw migrationError(created.error);
    nextVersion = created.data;
  }

  const { data: assignments, error: assignmentsError } = await adminClient
    .from("course_assignments")
    .select(
      "id, user_id, assignment_status, completed_at, course_version_id, attempt_number"
    )
    .eq("course_id", course.id)
    .eq("role", "trainee");
  if (assignmentsError) throw migrationError(assignmentsError);

  let resetCount = 0;
  const affectedUserIds = new Set<string>();
  for (const assignment of assignments || []) {
    affectedUserIds.add(assignment.user_id);
    if (assignment.course_version_id === nextVersion.id) continue;

    if (assignment.assignment_status === "completed" && assignment.completed_at) {
      await recordCourseCompletion({
        assignmentId: assignment.id,
        completedAt: assignment.completed_at,
        actorId: args.actorId,
        reason: "version_release",
        adminClient,
      });
    }

    // Clearing is allowed only after the completed record above is durable.
    const [progressDelete, responseDelete] = await Promise.all([
      adminClient.from("assignment_progress").delete().eq("assignment_id", assignment.id),
      adminClient
        .from("requirement_responses")
        .delete()
        .eq("assignment_id", assignment.id),
    ]);
    if (progressDelete.error) throw new Error(progressDelete.error.message);
    if (responseDelete.error) throw new Error(responseDelete.error.message);

    const { error: resetError } = await adminClient
      .from("course_assignments")
      .update({
        assignment_status: "assigned",
        completed_at: null,
        course_version_id: nextVersion.id,
        attempt_number: (assignment.attempt_number || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);
    if (resetError) throw migrationError(resetError);
    resetCount += 1;
  }

  // A completed authorisation that depends on this course must also become a
  // retake. Preserve the prior approval first so it remains current during the
  // retake under the app's existing grace rule.
  let authorisationResetCount = 0;
  const { data: authLinks, error: authLinksError } = await adminClient
    .from("authorisation_courses")
    .select("authorisation_id")
    .eq("course_id", course.id);
  if (authLinksError) throw new Error(authLinksError.message);
  const authorisationIds = [...new Set((authLinks || []).map((link: any) => link.authorisation_id))];
  if (authorisationIds.length > 0 && affectedUserIds.size > 0) {
    const { data: authAssignments, error: authAssignmentsError } = await adminClient
      .from("authorisation_assignments")
      .select("id, assignment_status, completed_at, attempt_number")
      .in("user_id", [...affectedUserIds])
      .in("authorisation_id", authorisationIds)
      .eq("role", "trainee")
      .eq("assignment_status", "completed");
    if (authAssignmentsError) throw migrationError(authAssignmentsError);

    for (const authAssignment of authAssignments || []) {
      await recordAuthorisationCompletion({
        assignmentId: authAssignment.id,
        completedAt: authAssignment.completed_at,
        actorId: args.actorId,
        reason: "retake",
        adminClient,
      });
      const { error: authResetError } = await adminClient
        .from("authorisation_assignments")
        .update({
          assignment_status: "assigned",
          completed_at: null,
          attempt_number: (authAssignment.attempt_number || 1) + 1,
        })
        .eq("id", authAssignment.id);
      if (authResetError) throw migrationError(authResetError);
      authorisationResetCount += 1;
    }
  }

  const { error: courseUpdateError } = await adminClient
    .from("courses")
    .update({ current_version_number: nextVersionNumber })
    .eq("id", course.id);
  if (courseUpdateError) throw migrationError(courseUpdateError);

  const { error: publishError } = await adminClient
    .from("course_versions")
    .update({ status: "published" })
    .eq("id", nextVersion.id);
  if (publishError) throw migrationError(publishError);

  await adminClient
    .from("course_versions")
    .update({ status: "superseded" })
    .eq("course_id", course.id)
    .lt("version_number", nextVersionNumber);

  return {
    versionNumber: nextVersionNumber,
    resetCount,
    authorisationResetCount,
    versionId: nextVersion.id,
  };
}