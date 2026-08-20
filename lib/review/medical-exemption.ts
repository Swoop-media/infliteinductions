export const MEDICAL_EXEMPTION_QUESTION = "medical falls under our exemption";

export type MedicalExemptionContext = {
  courseTitle: string | null;
  moduleTitle: string | null;
};

type OnsiteResponse = {
  requirement_label?: unknown;
  response_text?: unknown;
};

type ReviewModule = {
  module_type?: string | null;
  module_title?: string | null;
  onsite_responses?: OnsiteResponse[];
};

type ReviewCourse = {
  course_title?: string | null;
  modules?: ReviewModule[];
};

function normaliseResponseText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function getMedicalExemptionAnswers(
  courses: ReviewCourse[]
): MedicalExemptionContext[] {
  const contexts = courses.flatMap((course) =>
    (course.modules || []).flatMap((module) =>
      module.module_type === "onsite_assessment"
        ? (module.onsite_responses || [])
            .filter(
              (response) =>
                normaliseResponseText(response.requirement_label) ===
                  MEDICAL_EXEMPTION_QUESTION &&
                normaliseResponseText(response.response_text) === "yes"
            )
            .map(() => ({
              courseTitle: course.course_title || null,
              moduleTitle: module.module_title || null,
            }))
        : []
    )
  );

  return Array.from(
    new Map(
      contexts.map((context) => [
        JSON.stringify([context.courseTitle, context.moduleTitle]),
        context,
      ])
    ).values()
  );
}