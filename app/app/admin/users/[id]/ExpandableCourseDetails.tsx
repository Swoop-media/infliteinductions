"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User, AlertCircle, BookOpen, Target, Calendar } from "lucide-react";
import AdminRetakeButton from "./AdminRetakeButton";

// Quiz Attempt Component to handle state properly
function QuizAttemptView({ attempt, idx, moduleId, quizInfo }: any) {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <div className="bg-gray-50 rounded p-2 text-sm">
      <div 
        className="flex items-center justify-between cursor-pointer hover:bg-gray-100 p-1 rounded"
        onClick={() => setShowDetails(!showDetails)}
      >
        <span className="flex items-center gap-2">
          <span>Attempt {idx + 1}</span>
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
        <span className={attempt.passed ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          Score: {attempt.score_pct}% {attempt.passed ? "(Passed)" : "(Failed)"}
          {attempt.pass_mark && ` - Pass mark: ${attempt.pass_mark}%`}
        </span>
      </div>
      {attempt.created_at && (
        <div className="text-xs text-gray-500 mt-1">
          {formatDateTimeSafe(attempt.created_at)}
        </div>
      )}
      
      {/* Show quiz questions and answers when expanded */}
      {showDetails && attempt.questions_with_answers && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {attempt.questions_with_answers.map((question: any, qIdx: number) => {
            const userAnswer = attempt.answers?.[question.id];
            const selectedOption = question.options?.find((opt: any) => opt.id === userAnswer);
            const correctOption = question.options?.find((opt: any) => opt.is_correct);
            const isCorrect = selectedOption?.is_correct;
            
            return (
              <div key={`q-${question.id}-${qIdx}`} className="bg-white rounded p-3 border">
                <div className="font-medium text-gray-700 mb-2">
                  Question {qIdx + 1}: {question.question_text}
                  {question.points && <span className="text-xs text-gray-500 ml-2">({question.points} points)</span>}
                </div>
                
                <div className="space-y-1 ml-4">
                  {question.options?.map((option: any) => {
                    const isSelected = option.id === userAnswer;
                    const optionClass = isSelected 
                      ? (option.is_correct ? "bg-green-100 border-green-300" : "bg-red-100 border-red-300")
                      : (option.is_correct ? "bg-green-50 border-green-200" : "");
                    
                    return (
                      <div 
                        key={option.id} 
                        className={`p-2 rounded border ${optionClass || "border-gray-200"}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm">
                            {isSelected && (isCorrect ? "✅" : "❌")}
                            {!isSelected && option.is_correct && "✓"}
                          </span>
                          <span className={`text-sm ${isSelected ? "font-medium" : ""}`}>
                            {option.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {userAnswer ? (
                  <div className={`text-xs mt-2 ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                    Your answer: {selectedOption?.label || "Unknown"}
                    {!isCorrect && correctOption && ` (Correct answer: ${correctOption.label})`}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mt-2">No answer provided</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Show quiz info if no attempts have detailed questions */}
      {showDetails && !attempt.questions_with_answers && quizInfo && (
        <div className="mt-3 text-sm text-gray-600 italic">
          Quiz has {quizInfo.questions.length} questions (Pass mark: {quizInfo.pass_mark}%)
        </div>
      )}
    </div>
  );
}

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
    pass_mark?: number;
    answers?: any;
    created_at: string;
    questions_with_answers?: Array<{
      id?: string;
      question_text?: string;
      points?: number;
      options?: Array<{
        id: string;
        label: string;
        is_correct: boolean;
      }>;
    }>;
  }>;
  quiz_info?: {
    quiz_id: string;
    pass_mark: number;
    questions: Array<{
      id: string;
      question_text: string;
      points: number;
      options: Array<{
        id: string;
        label: string;
        is_correct: boolean;
      }>;
    }>;
  };
  onsite_responses?: Array<{
    requirement_id?: string;
    requirement_label: string;
    response_text: string | null;
    response_date: string | null;
    trainer_name?: string | null;
    field_type?: string;
    required?: boolean;
    has_response?: boolean;
  }>;
  equipment_requirements?: Array<{
    requirement_id: string;
    requirement_label: string;
    description?: string | null;
    response_text: string | null;
    response_date: string | null;
    trainer_name?: string | null;
    field_type?: string;
    required?: boolean;
    has_response?: boolean;
  }>;
  has_onsite_requirements?: boolean;
  include_equipment_assessment?: boolean;
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
      case "expired":
        return "bg-red-100 text-red-700";
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
      case "expired":
        return "Expired";
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
                    {course.assignment_status === 'completed' && (
                      <AdminRetakeButton
                        type="course"
                        userId={userId}
                        courseId={course.course_id}
                        courseTitle={course.course_title}
                      />
                    )}
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

                            {/* Digital Quiz - Show attempts and results with questions and answers */}
                            {module.module_type === "digital_assessment_quiz" && module.quiz_attempts && module.quiz_attempts.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700">Quiz Results:</p>
                                {module.quiz_attempts.map((attempt, idx) => (
                                  <QuizAttemptView 
                                    key={`quiz-${module.module_id}-attempt-${idx}-${attempt.created_at}`}
                                    attempt={attempt}
                                    idx={idx}
                                    moduleId={module.module_id}
                                    quizInfo={module.quiz_info}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Form Requirements - Show for all modules with requirements (digital training, onsite training/assessment, etc.) */}
                            {module.onsite_responses && module.onsite_responses.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700">
                                  {module.module_type === "onsite_training" ? "Training Requirements:" : 
                                   module.module_type === "onsite_assessment" ? "Assessment Requirements:" :
                                   module.module_type === "digital_training" ? "Form Questions:" :
                                   "Requirements:"}
                                </p>
                                {module.onsite_responses.map((response, idx) => (
                                  <div key={`onsite-${module.module_id}-${response.requirement_id || idx}`} className={`bg-gray-50 rounded p-2 text-sm ${response.has_response ? 'border-l-4 border-green-400' : 'border-l-4 border-gray-300'}`}>
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-gray-700">
                                          {response.requirement_label}
                                          {response.required && <span className="text-red-500 ml-1">*</span>}
                                        </div>
                                        {response.has_response ? (
                                          <>
                                            <div className="text-gray-600 mt-1">{response.response_text || "Completed"}</div>
                                            {response.trainer_name && (
                                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                                <User className="w-3 h-3" />
                                                <span>{module.module_type === "onsite_training" ? "Trained by" : "Assessed by"} {response.trainer_name}</span>
                                              </div>
                                            )}
                                            {response.response_date && (
                                              <div className="text-xs text-gray-500">
                                                {formatDateSafe(response.response_date)}
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div className="text-gray-500 italic mt-1">Not yet completed</div>
                                        )}
                                      </div>
                                      {response.has_response && (
                                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Equipment Assessment Requirements */}
                            {module.equipment_requirements && module.equipment_requirements.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700">Equipment Assessment:</p>
                                {module.equipment_requirements.map((equipment, idx) => (
                                  <div key={`equipment-${module.module_id}-${equipment.requirement_id}`} className={`bg-blue-50 rounded p-2 text-sm ${equipment.has_response ? 'border-l-4 border-blue-400' : 'border-l-4 border-gray-300'}`}>
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-gray-700">
                                          {equipment.requirement_label}
                                          {equipment.required && <span className="text-red-500 ml-1">*</span>}
                                        </div>
                                        {equipment.description && (
                                          <p className="text-xs text-gray-500 mt-0.5">{equipment.description}</p>
                                        )}
                                        {equipment.has_response ? (
                                          <>
                                            <div className="text-gray-600 mt-1">{equipment.response_text || "Equipment confirmed"}</div>
                                            {equipment.response_date && (
                                              <div className="text-xs text-gray-500 mt-1">
                                                Submitted: {formatDateSafe(equipment.response_date)}
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div className="text-gray-500 italic mt-1">Not yet provided</div>
                                        )}
                                      </div>
                                      {equipment.has_response && (
                                        <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                ))}
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
                    {auth.assignment_status === 'completed' && (
                      <AdminRetakeButton
                        type="authorization"
                        userId={userId}
                        authorizationId={auth.authorization_id}
                        authTitle={auth.authorization_title}
                      />
                    )}
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