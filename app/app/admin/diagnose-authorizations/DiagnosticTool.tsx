"use client";

import React from 'react';
import { AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface DiagnosticResult {
  id?: string;
  user: string;
  email?: string;
  userId: string;
  authorization: string;
  authId: string;
  currentStatus: string;
  expectedStatus?: string;
  progress: string;
  allCompleted: boolean;
  shouldBePending: boolean;
  completedAt?: string;
  approvedAt?: string;
  courses?: Array<{
    courseTitle: string;
    status: string;
    completed: boolean;
  }>;
  needsFix: boolean;
  issue?: string;
}

interface DiagnosticToolProps {
  results: DiagnosticResult[];
  onFix?: (result: DiagnosticResult) => void;
}

export default function DiagnosticTool({ results, onFix }: DiagnosticToolProps) {
  const issuesFound = results.filter(r => r.shouldBePending || r.needsFix);
  const noIssues = results.filter(r => !r.shouldBePending && !r.needsFix);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'assigned': 'bg-gray-100 text-gray-700',
      'in_progress': 'bg-blue-100 text-blue-700',
      'pending_approval': 'bg-yellow-100 text-yellow-700',
      'completed': 'bg-green-100 text-green-700',
      'approved': 'bg-purple-100 text-purple-700',
      'not_assigned': 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusIcon = (result: DiagnosticResult) => {
    if (result.needsFix) {
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
    if (result.shouldBePending) {
      return <Clock className="h-4 w-4 text-blue-500" />;
    }
    if (result.currentStatus === 'completed' || result.currentStatus === 'approved') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-gray-400" />;
  };

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Issues Section */}
      {issuesFound.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b border-red-200">
            <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Issues Found ({issuesFound.length})
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Authorization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issue
                  </th>
                  {onFix && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {issuesFound.map((result) => (
                  <tr key={`${result.userId}-${result.authId}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusIcon(result)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{result.user}</div>
                      {result.email && (
                        <div className="text-sm text-gray-500">{result.email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {result.authorization}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(result.currentStatus)}`}>
                        {result.currentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {result.expectedStatus && (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(result.expectedStatus)}`}>
                          {result.expectedStatus}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.progress}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {result.issue || (result.shouldBePending ? "Should be pending approval" : 
                       result.needsFix ? "Status mismatch" : "-")}
                    </td>
                    {onFix && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {result.currentStatus !== "completed" && result.currentStatus !== "approved" && (
                          <button
                            onClick={() => onFix(result)}
                            className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                          >
                            Fix
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Course Details for Issues */}
          <div className="px-4 py-3 bg-gray-50 border-t">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                View Course Details
              </summary>
              <div className="mt-3 space-y-3">
                {issuesFound.map((result) => (
                  <div key={`${result.userId}-${result.authId}-details`} className="bg-white p-3 rounded-md border border-gray-200">
                    <div className="text-sm font-medium text-gray-900 mb-2">
                      {result.user} - {result.authorization}
                    </div>
                    {result.courses && result.courses.length > 0 ? (
                      <div className="space-y-1">
                        {result.courses.map((course, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${course.completed ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="flex-1">{course.courseTitle}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${getStatusBadge(course.status)}`}>
                              {course.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No courses linked</div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* No Issues Section */}
      {noIssues.length > 0 && (
        <details className="bg-white rounded-lg shadow overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 bg-green-50 border-b border-green-200 hover:bg-green-100">
            <span className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 inline" />
              Authorizations with correct status ({noIssues.length})
            </span>
          </summary>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Authorization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {noIssues.map((result) => (
                  <tr key={`${result.userId}-${result.authId}-ok`}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{result.user}</div>
                      {result.email && (
                        <div className="text-sm text-gray-500">{result.email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {result.authorization}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(result.currentStatus)}`}>
                        {result.currentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.progress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}