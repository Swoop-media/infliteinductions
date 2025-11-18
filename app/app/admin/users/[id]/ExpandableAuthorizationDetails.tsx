"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Circle, Shield, Calendar } from "lucide-react";
import AdminRetakeButton from "./AdminRetakeButton";
import AdminRevokeButton from "./AdminRevokeButton";
import ExpandableCourseDetails from "./ExpandableCourseDetails";

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
  authorizations: CompletedAuthorization[];
  allAuthAssignments: any[];
  userId: string;
}

export default function ExpandableAuthorizationDetails({ authorizations, allAuthAssignments, userId }: Props) {
  const [expandedAuths, setExpandedAuths] = useState<Set<string>>(new Set());
  const [authCourses, setAuthCourses] = useState<Map<string, any>>(new Map());
  const [loadingAuth, setLoadingAuth] = useState<Set<string>>(new Set());

  const toggleAuthorization = async (authId: string, authorizationId: string) => {
    const newExpanded = new Set(expandedAuths);
    if (newExpanded.has(authId)) {
      newExpanded.delete(authId);
    } else {
      newExpanded.add(authId);
      // Fetch courses for this authorization if not already loaded
      if (!authCourses.has(authId) && !loadingAuth.has(authId)) {
        await fetchAuthorizationCourses(authId, authorizationId);
      }
    }
    setExpandedAuths(newExpanded);
  };

  const fetchAuthorizationCourses = async (authAssignmentId: string, authorizationId: string) => {
    setLoadingAuth(prev => new Set(prev).add(authAssignmentId));
    
    try {
      const response = await fetch(`/api/user-authorization-details?userId=${userId}&authorizationId=${authorizationId}`);
      if (response.ok) {
        const data = await response.json();
        setAuthCourses(prev => new Map(prev).set(authAssignmentId, data.courses || []));
      }
    } catch (error) {
      console.error('Failed to fetch authorization courses:', error);
    } finally {
      setLoadingAuth(prev => {
        const newSet = new Set(prev);
        newSet.delete(authAssignmentId);
        return newSet;
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current':
        return 'bg-green-100 text-green-800';
      case 'expiring_soon':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'no_expiry':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string, daysUntilExpiry: number | null) => {
    switch (status) {
      case 'current':
        return daysUntilExpiry !== null ? `${daysUntilExpiry} days remaining` : 'Current';
      case 'expiring_soon':
        return daysUntilExpiry !== null ? `${daysUntilExpiry} days remaining` : 'Expiring soon';
      case 'expired':
        return daysUntilExpiry !== null ? `Expired ${Math.abs(daysUntilExpiry)} days ago` : 'Expired';
      case 'no_expiry':
        return 'No expiry';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {authorizations.map((auth) => {
        // Get the authorization ID from the allAuthAssignments
        const authAssignment = allAuthAssignments.find(a => a.id === auth.assignment_id);
        const authorizationId = authAssignment?.authorisation_id;
        const isExpanded = expandedAuths.has(auth.assignment_id);
        const isLoading = loadingAuth.has(auth.assignment_id);
        const courses = authCourses.get(auth.assignment_id);

        return (
          <div key={auth.assignment_id} className="border rounded-lg overflow-hidden">
            {/* Authorization Header - Clickable */}
            <div
              className="p-3 cursor-pointer hover:bg-gray-50 transition-colors bg-gray-50"
              onClick={() => authorizationId && toggleAuthorization(auth.assignment_id, authorizationId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-gray-600" />
                  <div>
                    <h3 className="font-medium text-sm">{auth.authorization_title}</h3>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-600">
                        Completed: {formatDateSafe(auth.completed_at)}
                      </p>
                      {auth.due_date && (
                        <p className="text-xs text-gray-600">
                          Due: {formatDateSafe(auth.due_date)}
                        </p>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(auth.status)}`}>
                    {getStatusText(auth.status, auth.days_until_expiry)}
                  </span>
                  {authorizationId && (
                    <>
                      <AdminRetakeButton
                        type="authorization"
                        userId={userId}
                        authorizationId={authorizationId}
                        authTitle={auth.authorization_title}
                      />
                      <AdminRevokeButton
                        type="authorization"
                        userId={userId}
                        authorizationId={authorizationId}
                        assignmentId={auth.assignment_id}
                        authTitle={auth.authorization_title}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded Content - Courses within Authorization */}
            {isExpanded && (
              <div className="border-t bg-white p-4">
                {isLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading authorization courses...</div>
                ) : courses && courses.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-700 text-sm">Required Courses for this Authorization:</h4>
                      <span className="text-xs text-gray-500">
                        {courses.filter((c: any) => c.assignment_status === 'completed').length} of {courses.length} completed
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(courses.filter((c: any) => c.assignment_status === 'completed').length / courses.length) * 100}%` }}
                      />
                    </div>
                    
                    {courses.map((course: any, index: number) => {
                      const courseStatus = course.assignment_status || 'not_started';
                      const isCompleted = courseStatus === 'completed';
                      
                      return (
                        <div key={course.course_id} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-2 flex-1">
                              <div className="mt-0.5">
                                {isCompleted ? (
                                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-sm">
                                      {index + 1}. {course.course_title}
                                    </h5>
                                    {course.course_description && (
                                      <p className="text-xs text-gray-500 mt-0.5">{course.course_description}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1">
                                      <p className="text-xs text-gray-600">
                                        Status: <span className={isCompleted ? "text-green-600 font-medium" : "text-gray-600"}>
                                          {isCompleted 
                                            ? `Completed ${course.completed_at ? formatDateSafe(course.completed_at) : ''}` 
                                            : courseStatus === 'in_progress' 
                                              ? 'In Progress' 
                                              : 'Not Started'}
                                        </span>
                                      </p>
                                      {course.valid_for_months && (
                                        <p className="text-xs text-gray-500">
                                          Valid for: {course.valid_for_months} months
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ml-3 ${
                                    isCompleted 
                                      ? 'bg-green-100 text-green-700' 
                                      : courseStatus === 'in_progress'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {isCompleted 
                                      ? '✓ Completed' 
                                      : courseStatus === 'in_progress'
                                        ? '⏳ In Progress'
                                        : '○ Not Started'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Information note */}
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700">
                        <strong>Note:</strong> For detailed information about completed courses including quiz results, training records, and assessment details, 
                        please check the "Completed Courses" section below.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">No course information available for this authorization</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}