"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User, AlertCircle } from "lucide-react";

// Deterministic date formatting to prevent hydration mismatches
function formatDateSafe(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    // Parse the date and extract UTC components
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${month}/${day}/${year}`;
  } catch (error) {
    return '';
  }
}

function formatDateTimeSafe(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    // Parse the date and extract UTC components
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes} UTC`;
  } catch (error) {
    return '';
  }
}

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
    requirement_id: string;
    requirement_label: string;
    response_text: string;
    response_date: string | null;
    trainer_name?: string | null;
    field_type?: string;
    required?: boolean;
    has_response?: boolean;
  }>;
  has_onsite_requirements?: boolean;
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
                      ? `Completed ${formatDateSafe(course.assignment.completed_at)}`
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
                                      {formatDateTimeSafe(attempt.created_at)}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Onsite Training/Assessment - Show requirements and responses */}
                          {(module.module_type === "onsite_training" || module.module_type === "onsite_assessment") && (
                            <div className="space-y-2">
                              {module.onsite_responses && module.onsite_responses.length > 0 ? (
                                <>
                                  <p className="text-sm font-medium text-gray-700">
                                    {module.module_type === "onsite_training" ? "Training Requirements:" : "Assessment Requirements:"}
                                  </p>
                                  <div className="space-y-3">
                                    {module.onsite_responses.map((response) => (
                                      <div 
                                        key={response.requirement_id} 
                                        className={`rounded-lg p-3 border ${
                                          response.has_response 
                                            ? 'bg-green-50 border-green-200' 
                                            : 'bg-gray-50 border-gray-200'
                                        }`}
                                      >
                                        <div className="space-y-2">
                                          {/* Requirement Label with Required indicator */}
                                          <div className="flex items-start justify-between">
                                            <span className="text-sm font-semibold text-gray-700">
                                              {response.requirement_label}
                                              {response.required && <span className="text-red-500 ml-1">*</span>}
                                            </span>
                                            {response.has_response && (
                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                            )}
                                          </div>
                                          
                                          {/* Response Value */}
                                          {response.has_response ? (
                                            <>
                                              <div className="bg-white p-2 rounded border border-gray-100">
                                                <span className="text-sm text-gray-800">
                                                  {response.response_text || <span className="italic text-gray-400">No text response</span>}
                                                </span>
                                              </div>
                                              
                                              {/* Trainer/Assessor Info and Date */}
                                              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-200">
                                                {response.trainer_name && (
                                                  <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5 text-gray-500" />
                                                    <span className="text-xs text-gray-600 font-medium">
                                                      {module.module_type === "onsite_training" ? "Trainer:" : "Assessor:"} {response.trainer_name}
                                                    </span>
                                                  </div>
                                                )}
                                                {response.response_date && (
                                                  <div className="text-xs text-gray-500">
                                                    Completed: {formatDateSafe(response.response_date)}
                                                  </div>
                                                )}
                                              </div>
                                            </>
                                          ) : (
                                            <div className="text-sm text-gray-500 italic">
                                              Not yet completed
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : module.completed ? (
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                                    <div>
                                      <p className="text-yellow-800 font-medium">
                                        {module.module_type === "onsite_training" ? "Onsite Training Completed" : "Onsite Assessment Completed"}
                                      </p>
                                      <p className="text-yellow-700 text-xs mt-1">
                                        Module marked as completed but detailed requirement responses are not available in the system.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 italic">
                                  {module.module_type === "onsite_training" ? "Onsite training not yet completed" : "Onsite assessment not yet completed"}
                                </div>
                              )}
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
                                      ({formatDateSafe(doc.uploaded_at)})
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