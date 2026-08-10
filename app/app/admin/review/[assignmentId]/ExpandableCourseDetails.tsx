"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User, AlertCircle } from "lucide-react";
import RejectModuleButton from "./RejectModuleButton";
import { DocumentViewButton } from "../../users/[id]/DocumentViewButton";

// Requirement responses that are file uploads store the storage path as the
// response value (optionally JSON-quoted). Detect them so we can show a
// "View uploaded file" link instead of the raw path.
function requirementUploadPath(text: string | null): string | null {
  if (typeof text !== "string") return null;
  const cleaned = text.trim().replace(/^"|"$/g, "");
  return cleaned.startsWith("requirement-uploads/") ? cleaned : null;
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
  quiz_review_comments?: Array<{
    reviewer_name: string;
    comments: string;
    updated_at: string;
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
  equipment_requirements?: Array<{
    requirement_id: string;
    requirement_label: string;
    description?: string | null;
    response_text: string;
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
    file_path?: string | null;
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
  assignmentId: string;
  userId: string;
}

export default function ExpandableCourseDetails({ courses, assignmentId, userId }: Props) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [equipmentData, setEquipmentData] = useState<Map<string, any>>(new Map());
  const [loadingEquipment, setLoadingEquipment] = useState<Set<string>>(new Set());
  const [expandedQuizAttempts, setExpandedQuizAttempts] = useState<Set<string>>(new Set());

  // Debug: Check what assignment data we're receiving
  React.useEffect(() => {
    console.log('ExpandableCourseDetails - courses received:', courses.map(c => ({
      course_id: c.course_id,
      assignment: c.assignment,
      assignment_user_id: c.assignment?.user_id
    })));
  }, [courses]);

  const toggleCourse = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedCourses(newExpanded);
  };
  
  const toggleModule = async (moduleId: string, courseId: string, userId?: string) => {
    console.log('toggleModule - userId received:', userId);
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
      // Load equipment data if not already loaded
      const equipmentKey = `${courseId}_${moduleId}`;
      if (!equipmentData.has(equipmentKey) && !loadingEquipment.has(equipmentKey)) {
        console.log('Fetching equipment data with userId:', userId);
        await fetchEquipmentData(courseId, moduleId, userId);
      }
    }
    setExpandedModules(newExpanded);
  };
  
  const fetchEquipmentData = async (courseId: string, moduleId: string, userId?: string) => {
    const equipmentKey = `${courseId}_${moduleId}`;
    setLoadingEquipment(prev => new Set(prev).add(equipmentKey));
    
    try {
      // Fetch equipment templates
      const equipmentResponse = await fetch(`/api/courses/${courseId}/equipment`);
      let equipmentTemplates = [];
      if (equipmentResponse.ok) {
        equipmentTemplates = await equipmentResponse.json();
      }
      
      // Fetch trainee responses if userId provided
      let responses: Record<string, any> = {};
      if (userId) {
        const responsesUrl = `/api/courses/${courseId}/equipment/responses?trainee_id=${userId}`;
        const responsesResponse = await fetch(responsesUrl);
        
        if (responsesResponse.ok) {
          const responseData = await responsesResponse.json();
          // Create a map of equipment_id to response
          responseData.forEach((resp: any) => {
            responses[resp.equipment_id] = resp;
          });
        }
      }
      
      // Combine equipment templates with responses
      const combinedData = equipmentTemplates.map((equipment: any) => ({
        ...equipment,
        response: responses[equipment.id] || null
      }));
      
      setEquipmentData(prev => new Map(prev).set(equipmentKey, combinedData));
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
    } finally {
      setLoadingEquipment(prev => {
        const newSet = new Set(prev);
        newSet.delete(equipmentKey);
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
                        {/* Module Header - Make clickable for modules with equipment */}
                        <div 
                          className={`flex items-start justify-between mb-3 ${
                            (module.module_title?.toLowerCase().includes('equipment') || 
                             module.include_equipment_assessment) ? 'cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded-lg' : ''
                          }`}
                          onClick={(e) => {
                            // Prevent click if clicking on reject button
                            if ((e.target as HTMLElement).closest('button')) {
                              return;
                            }
                            if (module.module_title?.toLowerCase().includes('equipment') || 
                                module.include_equipment_assessment) {
                              // Pass the user_id from the assignment
                              const userId = course.assignment?.user_id;
                              console.log('Equipment module clicked:', {
                                courseId: course.course_id,
                                moduleId: module.module_id,
                                assignment: course.assignment,
                                userId: userId
                              });
                              toggleModule(module.module_id, course.course_id, userId);
                            }
                          }}
                        >
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
                          <div className="flex items-center gap-2">
                            {/* Reject button - show for modules with any progress */}
                            {(module.completed || 
                              (module.quiz_attempts && module.quiz_attempts.length > 0) ||
                              (module.onsite_responses && module.onsite_responses.some(r => r.has_response)) ||
                              (module.equipment_requirements && module.equipment_requirements.some(r => r.has_response))) && (
                              <RejectModuleButton
                                assignmentId={assignmentId}
                                courseId={course.course_id}
                                moduleId={module.module_id}
                                moduleTitle={module.module_title}
                                moduleType={module.module_type}
                                userId={userId}
                              />
                            )}
                            {/* Show expand/collapse icon for equipment modules */}
                            {(module.module_title?.toLowerCase().includes('equipment') || 
                              module.include_equipment_assessment) && (
                              expandedModules.has(module.module_id) ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )
                            )}
                          </div>
                        </div>

                        {/* Module Content Based on Type */}
                        <div className="ml-7 space-y-2">
                          {/* Show equipment items if module is expanded and has equipment */}
                          {expandedModules.has(module.module_id) && 
                           (module.module_title?.toLowerCase().includes('equipment') || 
                            module.include_equipment_assessment) && (
                            <div className="space-y-2 mt-4">
                              {loadingEquipment.has(`${course.course_id}_${module.module_id}`) ? (
                                <div className="text-sm text-gray-500 italic">Loading equipment items...</div>
                              ) : equipmentData.has(`${course.course_id}_${module.module_id}`) ? (
                                <div className="space-y-2 border rounded-lg p-3 bg-blue-50">
                                  <p className="text-sm font-medium text-blue-900">
                                    Equipment Assessment Items:
                                  </p>
                                  <div className="space-y-2">
                                    {equipmentData.get(`${course.course_id}_${module.module_id}`).map((equipment: any) => (
                                      <div 
                                        key={equipment.id} 
                                        className={`rounded-lg p-3 border ${
                                          equipment.response 
                                            ? 'bg-green-50 border-green-200' 
                                            : 'bg-white border-gray-200'
                                        }`}
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-start justify-between">
                                            <div>
                                              <span className="text-sm font-semibold text-gray-700">
                                                {equipment.equipment_name}
                                                {equipment.required && <span className="text-red-500 ml-1">*</span>}
                                              </span>
                                              {equipment.description && (
                                                <p className="text-xs text-gray-500 mt-0.5">{equipment.description}</p>
                                              )}
                                            </div>
                                            {equipment.response && (
                                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                            )}
                                          </div>
                                          {/* Show trainee's response */}
                                          {equipment.response ? (
                                            <>
                                              {equipment.response.response_text && (
                                                <div className="bg-white p-2 rounded border border-gray-100 mt-2">
                                                  <span className="text-sm text-gray-800">
                                                    {equipment.response.response_text}
                                                  </span>
                                                </div>
                                              )}
                                              {equipment.response.response_date && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                  Submitted: {formatDateSafe(equipment.response.response_date)}
                                                </div>
                                              )}
                                            </>
                                          ) : (
                                            <div className="text-sm text-gray-500 italic mt-1">
                                              Not yet completed
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                          
                          {/* Digital Training - Show completion status */}
                          {module.module_type === "digital_training" && module.completed && 
                           !module.module_title?.toLowerCase().includes('equipment') && (
                            <div className="text-sm text-gray-600">
                              <span className="text-green-600">✓</span> Module completed - All pages viewed
                            </div>
                          )}

                          {/* Digital Quiz - Show quiz info and attempts */}
                          {module.module_type === "digital_assessment_quiz" && (
                            <div className="space-y-3">
                              {/* Show quiz info if available */}
                              {module.quiz_info && (
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-medium text-blue-900">Quiz Information</p>
                                    <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                                      Pass Mark: {module.quiz_info.pass_mark}%
                                    </span>
                                  </div>
                                  
                                  {/* Show quiz questions */}
                                  <div className="space-y-2 mt-3">
                                    <p className="text-xs font-medium text-gray-600 uppercase">Questions ({module.quiz_info.questions.length}):</p>
                                    {module.quiz_info.questions.map((question, qIdx) => (
                                      <div key={question.id} className="bg-white rounded p-2 border border-blue-100">
                                        <div className="text-sm font-medium text-gray-700 mb-1">
                                          Q{qIdx + 1}: {question.question_text}
                                        </div>
                                        {question.points > 1 && (
                                          <div className="text-xs text-gray-500 mb-1">Points: {question.points}</div>
                                        )}
                                        <div className="space-y-1 ml-3">
                                          {question.options.map((option, optIdx) => (
                                            <div 
                                              key={option.id}
                                              className={`text-xs p-1 rounded flex items-center gap-2 ${
                                                option.is_correct ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
                                              }`}
                                            >
                                              <span className="font-medium">
                                                {String.fromCharCode(65 + optIdx)}:
                                              </span>
                                              <span>{option.label}</span>
                                              {option.is_correct && (
                                                <span className="ml-auto text-green-600">✓ Correct</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Show attempts if any */}
                              {module.quiz_attempts && module.quiz_attempts.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-gray-700">Quiz Attempts:</p>
                                  {module.quiz_attempts.map((attempt, idx) => (
                                    <div key={idx} className="bg-gray-50 rounded p-3 text-sm">
                                      <div className="flex items-center justify-between">
                                        <span>Attempt {idx + 1}</span>
                                        <div className="flex items-center gap-3">
                                          <span className={attempt.passed ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                            Score: {attempt.score_pct}%
                                          </span>
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            attempt.passed 
                                              ? "bg-green-100 text-green-800" 
                                              : "bg-red-100 text-red-800"
                                          }`}>
                                            {attempt.passed ? "Passed" : "Failed"}
                                          </span>
                                          {attempt.pass_mark && (
                                            <span className="text-xs text-gray-500">
                                              (Required: {attempt.pass_mark}%)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {attempt.created_at && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Completed: {formatDateTimeSafe(attempt.created_at)}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Show no attempts message if quiz exists but no attempts */}
                              {module.quiz_info && (!module.quiz_attempts || module.quiz_attempts.length === 0) && (
                                <div className="text-sm text-gray-500 italic">
                                  No quiz attempts recorded
                                </div>
                              )}

                              {/* Onsite reviewer comments on this quiz */}
                              {module.quiz_review_comments && module.quiz_review_comments.length > 0 && (
                                <div className="space-y-2 border rounded-lg p-3 bg-amber-50">
                                  <p className="text-sm font-medium text-amber-900">
                                    Onsite Reviewer Comments:
                                  </p>
                                  {module.quiz_review_comments.map((review, idx) => (
                                    <div key={idx} className="bg-white rounded p-2 text-sm">
                                      <p className="text-xs text-gray-500">
                                        {review.reviewer_name} — {formatDateTimeSafe(review.updated_at)}
                                      </p>
                                      <p className="whitespace-pre-wrap">{review.comments}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Equipment Assessment Requirements - Show as expandable section */}
                          {module.equipment_requirements && module.equipment_requirements.length > 0 && (
                            <div className="space-y-2 border rounded-lg p-3 bg-blue-50">
                              <p className="text-sm font-medium text-blue-900">
                                Equipment Assessment Items:
                              </p>
                              <div className="space-y-2">
                                {module.equipment_requirements.map((equipment) => (
                                  <div 
                                    key={equipment.requirement_id} 
                                    className={`rounded-lg p-3 border ${
                                      equipment.has_response 
                                        ? 'bg-green-50 border-green-200' 
                                        : 'bg-white border-gray-200'
                                    }`}
                                  >
                                    <div className="space-y-1">
                                      {/* Equipment Name with completion status */}
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <span className="text-sm font-semibold text-gray-700">
                                            {equipment.requirement_label}
                                            {equipment.required && <span className="text-red-500 ml-1">*</span>}
                                          </span>
                                          {equipment.description && (
                                            <p className="text-xs text-gray-500 mt-0.5">{equipment.description}</p>
                                          )}
                                        </div>
                                        {equipment.has_response && (
                                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                        )}
                                      </div>
                                      
                                      {/* Response or status */}
                                      {equipment.has_response ? (
                                        <>
                                          {equipment.response_text && (
                                            <div className="bg-white p-2 rounded border border-gray-100 mt-2">
                                              <span className="text-sm text-gray-800">
                                                {equipment.response_text}
                                              </span>
                                            </div>
                                          )}
                                          {equipment.response_date && (
                                            <div className="text-xs text-gray-500 mt-1">
                                              Completed: {formatDateSafe(equipment.response_date)}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-sm text-gray-500 italic mt-1">
                                          Not yet completed
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Form Requirements - Show for all modules with requirements (digital training, onsite training/assessment, etc.) */}
                          {module.onsite_responses && module.onsite_responses.length > 0 && (
                            <div className="space-y-2">
                              <>
                                <p className="text-sm font-medium text-gray-700">
                                  {module.module_type === "onsite_training" ? "Training Requirements:" : 
                                   module.module_type === "onsite_assessment" ? "Assessment Requirements:" :
                                   module.module_type === "digital_training" ? "Form Questions:" :
                                   "Requirements:"}
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
                                                {requirementUploadPath(response.response_text) ? (
                                                  <a
                                                    href={`/api/download-requirement-file?path=${encodeURIComponent(requirementUploadPath(response.response_text))}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                                                  >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    View uploaded file
                                                  </a>
                                                ) : (
                                                  <span className="text-sm text-gray-800">
                                                    {response.response_text || <span className="italic text-gray-400">No text response</span>}
                                                  </span>
                                                )}
                                              </div>
                                              
                                              {/* Trainer/Assessor Info and Date */}
                                              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-200">
                                                {response.trainer_name && (
                                                  <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5 text-gray-500" />
                                                    <span className="text-xs text-gray-600 font-medium">
                                                      {module.module_type === "onsite_training" ? "Trainer:" : 
                                                       module.module_type === "onsite_assessment" ? "Assessor:" :
                                                       "Completed by:"} {response.trainer_name}
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
                                  {doc.file_path && (
                                    <DocumentViewButton filePath={doc.file_path} title={doc.document_title} />
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