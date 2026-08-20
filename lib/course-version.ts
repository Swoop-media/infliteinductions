// @ts-nocheck

type PinnedCourseOptions = {
  assignmentId?: string;
  userId?: string;
  courseId?: string;
};

function invalidPinnedVersion(message: string): Error {
  return new Error(`Pinned course version is unavailable: ${message}`);
}

export async function getPinnedCourseContext(
  adminClient: any,
  options: PinnedCourseOptions
) {
  let query = adminClient
    .from("course_assignments")
    .select(
      "id, user_id, course_id, role, assignment_status, completed_at, assigned_at, course_version_id, attempt_number"
    )
    .eq("role", "trainee");

  if (options.assignmentId) query = query.eq("id", options.assignmentId);
  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.courseId) query = query.eq("course_id", options.courseId);

  const { data: assignment, error: assignmentError } = await query.maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment) throw new Error("Trainee course assignment not found.");
  if (!assignment.course_version_id) {
    throw invalidPinnedVersion("the assignment is not linked to an immutable version");
  }

  const { data: version, error: versionError } = await adminClient
    .from("course_versions")
    .select(
      "id, course_id, version_number, title, description, snapshot, status, change_notes, published_at"
    )
    .eq("id", assignment.course_version_id)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) throw invalidPinnedVersion("the linked version record does not exist");
  if (version.course_id !== assignment.course_id) {
    throw invalidPinnedVersion("the linked version belongs to a different course");
  }

  const snapshot = version.snapshot;
  if (!snapshot || !snapshot.course || !Array.isArray(snapshot.modules)) {
    throw invalidPinnedVersion("the linked version snapshot is incomplete");
  }

  return {
    assignment,
    version,
    snapshot,
    course: snapshot.course,
    modules: snapshot.modules,
    equipmentTemplates: Array.isArray(snapshot.equipment_templates)
      ? snapshot.equipment_templates
      : [],
  };
}

export function findPinnedModule(context: any, moduleId: string) {
  const module = context.modules.find((item: any) => item?.id === moduleId);
  if (!module) {
    throw invalidPinnedVersion("the requested module is not part of this assignment");
  }
  return module;
}

export function findPinnedQuiz(module: any, quizId?: string | null) {
  const quizzes = Array.isArray(module?.quizzes) ? module.quizzes : [];
  const quiz = quizId
    ? quizzes.find((item: any) => item?.id === quizId)
    : quizzes[0];
  if (!quiz) {
    throw invalidPinnedVersion("the requested quiz is not part of this assignment");
  }
  return quiz;
}

export function pinnedSnapshotSource(version: any) {
  return String(version?.change_notes || "").startsWith(
    "Baseline captured when immutable training history was enabled"
  )
    ? "baseline_backfill"
    : "exact";
}