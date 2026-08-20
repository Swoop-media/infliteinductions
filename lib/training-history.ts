// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pinnedSnapshotSource } from "@/lib/course-version";
import {
  assertResumableCourseVersion,
  courseVersionReleaseAttribution,
} from "@/lib/course-version-logs";

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

  const versionId = assignment.course_version_id;
  if (!versionId) {
    throw new Error(
      `Immutable training history is not ready. Re-apply app/migrations/${IMMUTABLE_HISTORY_MIGRATION} before completing this course.`
    );
  }
  const { data: version, error: versionError } = await adminClient
    .from("course_versions")
    .select("id, course_id, version_number, title, snapshot, change_notes, published_at")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw migrationError(versionError);
  if (!version || version.course_id !== assignment.course_id || !version.snapshot) {
    throw new Error("The assignment's immutable course version could not be loaded.");
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

  // The assignment's pinned release is the course definition the learner was
  // actually given. Never recapture mutable live content at completion.
  const courseSnapshot = version.snapshot;
  const snapshotSource = pinnedSnapshotSource(version);

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
 * Creates the next immutable course definition without changing any learner
 * assignment. A learner is moved to the latest version only when an explicit
 * retake/reset starts a fresh attempt. It is retry-safe: a half-finished
 * publishing row is resumed rather than creating another version.
 */
export async function publishNewCourseVersion(args: {
  courseId: string;
  actorId: string;
  changeNotes?: string | null;
}) {
  const releaseAttribution = courseVersionReleaseAttribution(args.changeNotes, args.actorId);
  const changeNotes = releaseAttribution.change_notes;
  const adminClient = supabaseAdmin();
  const { data: course, error: courseError } = await adminClient
    .from("courses")
    .select("id, title, description, status, current_version_number")
    .eq("id", args.courseId)
    .maybeSingle();
  if (courseError) throw migrationError(courseError);
  if (!course) throw new Error("Course not found.");
  if (course.status !== "published") {
    throw new Error("Only a published course can release a new version.");
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
    .select("id, version_number, status, change_notes, published_by, published_at")
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
        ...releaseAttribution,
      })
      .select("id, version_number, status")
      .single();
    if (created.error) throw migrationError(created.error);
    nextVersion = created.data;
  } else if (nextVersion.status === "publishing") {
    // Migration 032 makes attribution immutable as soon as the publishing row
    // exists. A retry therefore preserves the original summary and publisher,
    // and only completes the permitted publishing -> published transition.
    assertResumableCourseVersion(nextVersion);
  }

  const { error: publishError } = await adminClient
    .from("course_versions")
    .update({ status: "published" })
    .eq("id", nextVersion.id);
  if (publishError) throw migrationError(publishError);

  const { error: courseUpdateError } = await adminClient
    .from("courses")
    .update({ current_version_number: nextVersionNumber })
    .eq("id", course.id);
  if (courseUpdateError) throw migrationError(courseUpdateError);

  const { error: supersedeError } = await adminClient
    .from("course_versions")
    .update({ status: "superseded" })
    .eq("course_id", course.id)
    .lt("version_number", nextVersionNumber);
  if (supersedeError) throw migrationError(supersedeError);

  return {
    versionNumber: nextVersionNumber,
    versionId: nextVersion.id,
  };
}