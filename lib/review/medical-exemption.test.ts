import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMedicalExemptionAnswers,
  MEDICAL_EXEMPTION_QUESTION,
} from "./medical-exemption.ts";

const medicalResponse = (
  response_text: unknown,
  requirement_label = MEDICAL_EXEMPTION_QUESTION
) => ({
  requirement_label,
  response_text,
});

const onsiteAssessment = (
  module_title: string,
  onsite_responses: ReturnType<typeof medicalResponse>[]
) => ({
  module_type: "onsite_assessment",
  module_title,
  onsite_responses,
});

describe("getMedicalExemptionAnswers", () => {
  it("shows a context for an affirmative medical-exemption response", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [onsiteAssessment("Final assessment", [medicalResponse("Yes")])],
        },
      ]),
      [
        {
          courseTitle: "Skydiving Fundamentals",
          moduleTitle: "Final assessment",
        },
      ]
    );
  });

  it("does not show a context for a negative answer", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [onsiteAssessment("Final assessment", [medicalResponse("No")])],
        },
      ]),
      []
    );
  });

  it("does not show a context for an unanswered response", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [
            onsiteAssessment("Final assessment", [
              medicalResponse(""),
              medicalResponse(undefined),
            ]),
          ],
        },
      ]),
      []
    );
  });

  it("normalises whitespace and casing in both the question and affirmative answer", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [
            onsiteAssessment("Final assessment", [
              medicalResponse(
                "  yEs  ",
                "  MEDICAL   FALLS UNDER OUR EXEMPTION  "
              ),
            ]),
          ],
        },
      ]),
      [
        {
          courseTitle: "Skydiving Fundamentals",
          moduleTitle: "Final assessment",
        },
      ]
    );
  });

  it("ignores affirmative answers to unrelated questions", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [
            onsiteAssessment("Final assessment", [
              medicalResponse("Yes", "Do you require equipment adjustments?"),
            ]),
          ],
        },
      ]),
      []
    );
  });

  it("ignores medical-exemption answers outside onsite assessments", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [
            {
              module_type: "onsite_training",
              module_title: "Practical training",
              onsite_responses: [medicalResponse("Yes")],
            },
          ],
        },
      ]),
      []
    );
  });

  it("keeps one context per matching module across multiple courses", () => {
    assert.deepEqual(
      getMedicalExemptionAnswers([
        {
          course_title: "Skydiving Fundamentals",
          modules: [
            onsiteAssessment("Final assessment", [
              medicalResponse("Yes"),
              medicalResponse(" YES "),
            ]),
          ],
        },
        {
          course_title: "Advanced canopy control",
          modules: [
            onsiteAssessment("Canopy assessment", [medicalResponse("Yes")]),
          ],
        },
      ]),
      [
        {
          courseTitle: "Skydiving Fundamentals",
          moduleTitle: "Final assessment",
        },
        {
          courseTitle: "Advanced canopy control",
          moduleTitle: "Canopy assessment",
        },
      ]
    );
  });
});