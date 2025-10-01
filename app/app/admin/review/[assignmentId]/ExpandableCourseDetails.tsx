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
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [equipmentData, setEquipmentData] = useState<Map<string, any>>(new Map());
  const [loadingEquipment, setLoadingEquipment] = useState<Set<string>>(new Set());

  const toggleCourse = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedCourses(newExpanded);
  };
  
  const toggleModule = async (moduleId: string, courseId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
      // Load equipment data if not already loaded
      const equipmentKey = `${courseId}_${moduleId}`;
      if (!equipmentData.has(equipmentKey) && !loadingEquipment.has(equipmentKey)) {
        await fetchEquipmentData(courseId, moduleId);
      }
    }
    setExpandedModules(newExpanded);
  };
  
  const fetchEquipmentData = async (courseId: string, moduleId: string) => {
    const equipmentKey = `${courseId}_${moduleId}`;
    setLoadingEquipment(prev => new Set(prev).add(equipmentKey));
    
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment`);
      if (response.ok) {
        const data = await response.json();
        setEquipmentData(prev => new Map(prev).set(equipmentKey, data));
      }
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
                          onClick={() => {
                            if (module.module_title?.toLowerCase().includes('equipment') || 
                                module.include_equipment_assessment) {
                              toggleModule(module.module_id, course.course_id);
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
                                        className="rounded-lg p-3 border bg-white border-gray-200"
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
                                          </div>
                                          <div className="text-sm text-gray-500 italic mt-1">
                                            Equipment requirement
                                          </div>
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