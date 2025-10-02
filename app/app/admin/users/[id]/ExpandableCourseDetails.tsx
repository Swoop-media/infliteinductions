"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User, AlertCircle, BookOpen, Target, Calendar } from "lucide-react";

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
  assignment_status?: string;
  completed_at?: string;
  modules?: ModuleProgress[];
}

interface AuthorizationWithDetails {
  authorization_id: string;
  authorization_title: string;
  assignment_status?: string;
  completed_at?: string;
  courses?: CourseWithDetails[];
}

interface Props {
  courses?: CourseWithDetails[];
  authorizations?: AuthorizationWithDetails[];
  userId: string;
  type: 'courses' | 'authorizations';
}

export default function ExpandableCourseDetails({ courses, authorizations, userId, type }: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Map<string, any>>(new Map());

  const toggleItem = async (itemId: string, isAuthorization: boolean = false) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
      // Fetch details if not already loaded
      if (!itemDetails.has(itemId) && !loadingDetails.has(itemId)) {
        await fetchItemDetails(itemId, isAuthorization);
      }
    }
    setExpandedItems(newExpanded);
  };

  const fetchItemDetails = async (itemId: string, isAuthorization: boolean) => {
    setLoadingDetails(prev => new Set(prev).add(itemId));
    
    try {
      const endpoint = isAuthorization 
        ? `/api/user-authorization-details?userId=${userId}&authorizationId=${itemId}`
        : `/api/user-course-details?userId=${userId}&courseId=${itemId}`;
        
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        setItemDetails(prev => new Map(prev).set(itemId, data));
      }
    } catch (error) {
      console.error('Failed to fetch details:', error);
    } finally {
      setLoadingDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending_approval":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case "completed":
        return "✓ Completed";
      case "pending_approval":
        return "Pending Approval";
      case "in_progress":
        return "In Progress";
      default:
        return "Not Started";
    }
  };

  // Render courses
  if (type === 'courses' && courses) {
    return (
      <div className="space-y-4">
        {courses.map((course) => {
          const isExpanded = expandedItems.has(course.course_id);
          const isLoading = loadingDetails.has(course.course_id);
          const details = itemDetails.get(course.course_id);

          return (
            <div key={course.course_id} className="border rounded-lg overflow-hidden">
              {/* Course Header - Clickable */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleItem(course.course_id, false)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-gray-500" />
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
                      {course.completed_at
                        ? `Completed ${formatDateSafe(course.completed_at)}`
                        : "Not completed"}
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(course.assignment_status)}`}
                    >
                      {getStatusText(course.assignment_status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Module Details */}
              {isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  {isLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading course details...</div>
                  ) : details?.modules && details.modules.length > 0 ? (
                    <div className="space-y-4">
                      {details.modules.map((module: ModuleProgress) => (
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
                                  <div key={`quiz-${module.module_id}-attempt-${idx}-${attempt.created_at}`} className="bg-gray-50 rounded p-2 text-sm">
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

                            {/* Form Requirements - Show for all modules with requirements (digital training, onsite training/assessment, etc.) */}
                            {module.onsite_responses && module.onsite_responses.length > 0 && (
                              <div className="space-y-2">
                                {module.onsite_responses && module.onsite_responses.length > 0 ? (
                                  <>
                                    <p className="text-sm font-medium text-gray-700">
                                      {module.module_type === "onsite_training" ? "Training Requirements:" : 
                                       module.module_type === "onsite_assessment" ? "Assessment Requirements:" :
                                       module.module_type === "digital_training" ? "Form Questions:" :
                                       "Requirements:"}
                                    </p>
                                    {module.onsite_responses.map((response, idx) => (
                                      <div key={`onsite-${module.module_id}-${response.requirement_label}-${idx}`} className="bg-gray-50 rounded p-2 text-sm">
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
                                            {formatDateSafe(response.response_date)}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                ) : module.completed ? (
                                  <div className="text-sm text-gray-600">
                                    <span className="text-green-600">✓</span> {module.module_type === "onsite_training" ? "Onsite training completed" : "Onsite assessment completed"}
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
                                  <div key={`doc-${module.module_id}-${doc.document_title}-${idx}`} className="flex items-center gap-2 text-sm text-gray-600">
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
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No module details available</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Render authorizations
  if (type === 'authorizations' && authorizations) {
    return (
      <div className="space-y-4">
        {authorizations.map((auth) => {
          const isExpanded = expandedItems.has(auth.authorization_id);
          const isLoading = loadingDetails.has(auth.authorization_id);
          const details = itemDetails.get(auth.authorization_id);

          return (
            <div key={auth.authorization_id} className="border rounded-lg overflow-hidden">
              {/* Authorization Header - Clickable */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleItem(auth.authorization_id, true)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-gray-500" />
                      <h3 className="font-medium text-gray-900">{auth.authorization_title}</h3>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600">
                      {auth.completed_at
                        ? `Completed ${formatDateSafe(auth.completed_at)}`
                        : "In Progress"}
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(auth.assignment_status)}`}
                    >
                      {getStatusText(auth.assignment_status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Authorization Details */}
              {isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  {isLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading authorization details...</div>
                  ) : details?.courses && details.courses.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-700">Courses in this Authorization:</h4>
                      {details.courses.map((course: any) => (
                        <div key={course.course_id || course.course_title} className="bg-white rounded-lg p-3 border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {course.completed ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Circle className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="text-sm font-medium">{course.course_title}</span>
                            </div>
                            <span className={`text-xs ${course.completed ? 'text-green-600' : 'text-gray-500'}`}>
                              {course.completed ? `Completed ${formatDateSafe(course.completed_at)}` : 'Not completed'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No course details available</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}