"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, FileText, User, BookOpen } from "lucide-react";
import PrintButton from "./PrintButton";

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

// Deterministic time formatting to prevent hydration mismatches
function formatTimeSafe(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds} UTC`;
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

interface CompletedCourse {
  assignment_id: string;
  course_id: string;
  course_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: string;
  days_until_expiry: number;
  status: 'current' | 'expiring_soon' | 'expired';
}

interface CompletedAuthorization {
  assignment_id: string;
  authorization_title: string;
  completed_at: string;
  valid_for_years: number | null;
  due_date: string | null;
  days_until_expiry: number | null;
  status: 'current' | 'expiring_soon' | 'expired' | 'no_expiry';
}

interface Props {
  profile: {
    id: string;
    full_name: string;
    email: string;
    department?: string;
    job_description?: string;
  };
  courses: CompletedCourse[];
  authorizations: CompletedAuthorization[];
}

export default function ExpandableTrainingRecord({ profile, courses, authorizations }: Props) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [courseDetails, setCourseDetails] = useState<Map<string, any>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  const toggleCourse = async (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
      // Fetch details if not already loaded
      if (!courseDetails.has(courseId) && !loadingDetails.has(courseId)) {
        await fetchCourseDetails(courseId);
      }
    }
    setExpandedCourses(newExpanded);
  };

  const fetchCourseDetails = async (courseId: string) => {
    setLoadingDetails(prev => new Set(prev).add(courseId));
    
    try {
      const response = await fetch(`/api/user-course-details?userId=${profile.id}&courseId=${courseId}`);
      if (response.ok) {
        const data = await response.json();
        setCourseDetails(prev => new Map(prev).set(courseId, data));
      }
    } catch (error) {
      console.error('Failed to fetch course details:', error);
    } finally {
      setLoadingDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(courseId);
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
    <div className="max-w-4xl mx-auto p-8 bg-white min-h-screen print:p-6">
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body { -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
            .print-expanded { display: block !important; }
          }
        `
      }} />
      
      {/* Header */}
      <div className="border-b-2 border-gray-900 pb-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Training Record</h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Name:</strong> {profile.full_name || "Not specified"}</p>
            <p><strong>Email:</strong> {profile.email}</p>
          </div>
          <div>
            <p><strong>Department:</strong> {profile.department || "Not specified"}</p>
            <p><strong>Position:</strong> {profile.job_description || "Not specified"}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">Generated on: {formatDateSafe(new Date().toISOString())} at {formatTimeSafe(new Date().toISOString())}</p>
      </div>

      {/* Print Button */}
      <PrintButton />

      {/* Completed Authorizations */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          Completed Authorizations ({authorizations.length})
        </h2>
        {authorizations.length === 0 ? (
          <p className="text-gray-500 italic">No completed authorizations found.</p>
        ) : (
          <div className="space-y-3">
            {authorizations.map((auth) => (
              <div key={auth.assignment_id} className="border border-gray-300 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{auth.authorization_title}</h3>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <p><strong>Completed:</strong> {formatDateSafe(auth.completed_at)}</p>
                    {auth.due_date && (
                      <p><strong>Expires:</strong> {formatDateSafe(auth.due_date)}</p>
                    )}
                  </div>
                  <div>
                    <p><strong>Valid for:</strong> {auth.valid_for_years ? `${auth.valid_for_years} year(s)` : 'No expiry'}</p>
                    <p><strong>Status:</strong> 
                      <span className={`ml-1 px-2 py-1 rounded text-xs ${
                        auth.status === 'current' ? 'bg-green-100 text-green-800' :
                        auth.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                        auth.status === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {auth.status === 'current' && auth.days_until_expiry ? `Current (${auth.days_until_expiry} days remaining)` :
                         auth.status === 'expiring_soon' && auth.days_until_expiry ? `Expires in ${auth.days_until_expiry} days` :
                         auth.status === 'expired' && auth.days_until_expiry ? `Expired ${Math.abs(auth.days_until_expiry)} days ago` :
                         'No expiry'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Courses */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          Completed Courses ({courses.length})
        </h2>
        {courses.length === 0 ? (
          <p className="text-gray-500 italic">No completed courses found.</p>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const isExpanded = expandedCourses.has(course.course_id);
              const isLoading = loadingDetails.has(course.course_id);
              const details = courseDetails.get(course.course_id);

              return (
                <div key={course.assignment_id} className="border border-gray-300 rounded-lg overflow-hidden">
                  {/* Course Header - Clickable */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors no-print"
                    onClick={() => toggleCourse(course.course_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-gray-600" />
                        <h3 className="font-semibold text-lg">{course.course_title}</h3>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Non-clickable version for print */}
                  <div className="p-4 hidden print:block">
                    <h3 className="font-semibold text-lg">{course.course_title}</h3>
                  </div>

                  {/* Course Info */}
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p><strong>Completed:</strong> {formatDateSafe(course.completed_at)}</p>
                        <p><strong>Expires:</strong> {formatDateSafe(course.due_date)}</p>
                      </div>
                      <div>
                        <p><strong>Valid for:</strong> {course.valid_for_days} days</p>
                        <p><strong>Status:</strong> 
                          <span className={`ml-1 px-2 py-1 rounded text-xs ${
                            course.status === 'current' ? 'bg-green-100 text-green-800' :
                            course.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {course.status === 'current' ? `Current (${course.days_until_expiry} days remaining)` :
                             course.status === 'expiring_soon' ? `Expires in ${course.days_until_expiry} days` :
                             `Expired ${Math.abs(course.days_until_expiry)} days ago`}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Module Details */}
                  {isExpanded && (
                    <div className="border-t bg-gray-50 p-4 print-expanded">
                      {isLoading ? (
                        <div className="text-center py-4 text-gray-500">Loading course details...</div>
                      ) : details?.modules && details.modules.length > 0 ? (
                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-700 mb-2">Course Modules:</h4>
                          {details.modules.map((module: ModuleProgress) => (
                            <div key={module.module_id} className="bg-white rounded-lg p-3 border">
                              {/* Module Header */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {module.completed ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-gray-400" />
                                  )}
                                  <div>
                                    <h5 className="font-medium text-sm">{module.module_title}</h5>
                                    <p className="text-xs text-gray-600">{formatModuleType(module.module_type)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Module Content */}
                              <div className="ml-6 space-y-2">
                                {/* Digital Quiz Results */}
                                {module.module_type === "digital_assessment_quiz" && module.quiz_attempts && module.quiz_attempts.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-gray-700">Quiz Results:</p>
                                    {module.quiz_attempts.map((attempt, idx) => (
                                      <div key={`quiz-${module.module_id}-${idx}`} className="bg-gray-50 rounded p-1.5 text-xs">
                                        <span>Attempt {idx + 1}: </span>
                                        <span className={attempt.passed ? "text-green-600" : "text-red-600"}>
                                          {attempt.score_pct}% {attempt.passed ? "(Passed)" : "(Failed)"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Form Requirements - Show for all modules with requirements (digital training, onsite training/assessment, etc.) */}
                                {module.onsite_responses && module.onsite_responses.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-gray-700">
                                      {module.module_type === "onsite_training" ? "Training Completed:" : 
                                       module.module_type === "onsite_assessment" ? "Assessment Completed:" :
                                       module.module_type === "digital_training" ? "Form Questions:" :
                                       "Requirements:"}
                                    </p>
                                    {module.onsite_responses.map((response, idx) => (
                                      <div key={`onsite-${module.module_id}-${idx}`} className="bg-gray-50 rounded p-1.5 text-xs">
                                        <div className="font-medium">{response.requirement_label}</div>
                                        {response.assessor_name && (
                                          <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                                            <User className="w-3 h-3" />
                                            <span>Assessed by {response.assessor_name}</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Documents */}
                                {module.documents && module.documents.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-gray-700">Documents:</p>
                                    {module.documents.map((doc, idx) => (
                                      <div key={`doc-${module.module_id}-${idx}`} className="flex items-center gap-1 text-xs text-gray-600">
                                        <FileText className="w-3 h-3" />
                                        <span>{doc.document_title}</span>
                                      </div>
                                    ))}
                                  </div>
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
        )}
      </div>

      {/* Footer */}
      <div className="border-t-2 border-gray-900 pt-4 mt-8 text-xs text-gray-500">
        <p>This training record was generated from the Learning Management System.</p>
        <p>For verification purposes, contact the training department.</p>
      </div>
    </div>
  );
}