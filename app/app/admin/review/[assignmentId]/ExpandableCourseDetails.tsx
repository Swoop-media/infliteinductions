"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User } from "lucide-react";

interface ModuleProgress {
  module_id: string;
  module_type: string;
  module_title: string;
  completed: boolean;
  quiz_attempts?: Array<{
    score_pct: number;
    passed: boolean;
    answers?: any;
    created_at: string;
  }>;
  onsite_responses?: Array<{
    requirement_label: string;
    response_text: string;
    response_date: string;
    assessor_name?: string;
  }>;
  documents?: Array<{
    document_title: string;
    uploaded_at: string;
  }>;
}

interface CourseWithDetails {
  course_id: string;
  course_title: string;
  course_description?: string;
  assignment: any;
  modules: ModuleProgress[];
}

interface Props {
  courses: CourseWithDetails[];
}

export default function ExpandableCourseDetails({ courses }: Props) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  const toggleCourse = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedCourses(newExpanded);
  };

  const formatModuleType = (type: string) => {
    switch (type) {
      case "digital_training":
        return "Digital Training";
      case "digital_assessment_quiz":
        return "Digital Quiz";
      case "onsite_training":
        return "Onsite Training";
      case "onsite_assessment":
        return "Onsite Assessment";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-4">
      {courses.map((course) => {
        const isExpanded = expandedCourses.has(course.course_id);
        const isCompleted = course.assignment?.assignment_status === "completed";
        const isPendingApproval = course.assignment?.assignment_status === "pending_approval";

        return (
          <div key={course.course_id} className="border rounded-lg overflow-hidden">
            {/* Course Header - Clickable */}
            <div
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleCourse(course.course_id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{course.course_title}</h3>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  {course.course_description && (
                    <p className="text-sm text-gray-600 mt-1">{course.course_description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {course.assignment?.completed_at
                      ? `Completed ${new Date(course.assignment.completed_at).toLocaleDateString()}`
                      : "Not completed"}
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      isCompleted
                        ? "bg-green-100 text-green-800"
                        : isPendingApproval
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {isCompleted ? "✓ Completed" : isPendingApproval ? "Pending Approval" : "Not Completed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Expanded Module Details */}
            {isExpanded && (
              <div className="border-t bg-gray-50 p-4">
                <div className="space-y-4">
                  {course.modules && course.modules.length > 0 ? (
                    course.modules.map((module) => (
                      <div key={module.module_id} className="bg-white rounded-lg p-4 border">
                        {/* Module Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {module.completed ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-400" />
                            )}
                            <div>
                              <h4 className="font-medium text-gray-900">{module.module_title}</h4>
                              <p className="text-sm text-gray-600">{formatModuleType(module.module_type)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Module Content Based on Type */}
                        <div className="ml-7 space-y-2">
                          {/* Digital Training - Show completion status */}
                          {module.module_type === "digital_training" && module.completed && (
                            <div className="text-sm text-gray-600">
                              <span className="text-green-600">✓</span> Module completed - All pages viewed
                            </div>
                          )}

                          {/* Digital Quiz - Show attempts and results */}
                          {module.module_type === "digital_assessment_quiz" && module.quiz_attempts && module.quiz_attempts.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-gray-700">Quiz Results:</p>
                              {module.quiz_attempts.map((attempt, idx) => (
                                <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span>Attempt {idx + 1}</span>
                                    <span className={attempt.passed ? "text-green-600" : "text-red-600"}>
                                      Score: {attempt.score_pct}% {attempt.passed ? "(Passed)" : "(Failed)"}
                                    </span>
                                  </div>
                                  {attempt.created_at && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {new Date(attempt.created_at).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Onsite Training/Assessment - Show requirements and responses */}
                          {(module.module_type === "onsite_training" || module.module_type === "onsite_assessment") && module.onsite_responses && module.onsite_responses.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-gray-700">
                                {module.module_type === "onsite_training" ? "Training Requirements:" : "Assessment Requirements:"}
                              </p>
                              {module.onsite_responses.map((response, idx) => (
                                <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                                  <div className="font-medium text-gray-700">{response.requirement_label}</div>
                                  <div className="text-gray-600 mt-1">{response.response_text || "No response provided"}</div>
                                  {response.assessor_name && (
                                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                      <User className="w-3 h-3" />
                                      <span>Assessed by {response.assessor_name}</span>
                                    </div>
                                  )}
                                  {response.response_date && (
                                    <div className="text-xs text-gray-500">
                                      {new Date(response.response_date).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Documents uploaded for this module */}
                          {module.documents && module.documents.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-gray-700">Uploaded Documents:</p>
                              {module.documents.map((doc, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                                  <FileText className="w-4 h-4" />
                                  <span>{doc.document_title}</span>
                                  {doc.uploaded_at && (
                                    <span className="text-xs text-gray-500">
                                      ({new Date(doc.uploaded_at).toLocaleDateString()})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* No data message */}
                          {!module.completed && !module.quiz_attempts?.length && !module.onsite_responses?.length && !module.documents?.length && (
                            <div className="text-sm text-gray-500 italic">No completion data available</div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500 italic">No module details available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}