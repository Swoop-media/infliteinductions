// @ts-nocheck
"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

export default function DiagnoseAuthorizationsPage() {
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diagnoseAuthorizations = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setStatus("Starting diagnosis...");

    try {
      const supabase = supabaseBrowser;
      const diagnosticResults = [];

      // Step 1: Get all authorization assignments that are NOT pending_approval
      setStatus("Fetching authorization assignments from Supabase...");
      
      const { data: authAssignments, error: authError } = await supabase
        .from("authorisation_assignments")
        .select(`
          id,
          user_id,
          authorisation_id,
          assignment_status,
          completed_at,
          approved_at,
          role
        `)
        .eq("role", "trainee")
        .neq("assignment_status", "pending_approval");

      if (authError) throw authError;

      setStatus(`Found ${authAssignments?.length || 0} authorization assignments not in pending_approval`);

      // Step 2: For each authorization assignment, check if all courses are completed
      for (const authAssignment of authAssignments || []) {
        // Get user info
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", authAssignment.user_id)
          .single();

        // Get authorization info
        const { data: authorization } = await supabase
          .from("authorisations")
          .select("title")
          .eq("id", authAssignment.authorisation_id)
          .single();

        // Get all courses for this authorization
        const { data: authCourses } = await supabase
          .from("authorisation_courses")
          .select(`
            course_id,
            courses!inner(
              id,
              title
            )
          `)
          .eq("authorisation_id", authAssignment.authorisation_id);

        if (!authCourses || authCourses.length === 0) {
          diagnosticResults.push({
            user: userProfile?.full_name || authAssignment.user_id,
            email: userProfile?.email,
            authorization: authorization?.title || authAssignment.authorisation_id,
            currentStatus: authAssignment.assignment_status,
            issue: "No courses linked to authorization",
            shouldBePending: false,
            completedAt: authAssignment.completed_at,
            approvedAt: authAssignment.approved_at
          });
          continue;
        }

        // Get user's course completion status
        const courseIds = authCourses.map(ac => ac.course_id);
        const { data: courseAssignments } = await supabase
          .from("course_assignments")
          .select(`
            course_id,
            assignment_status,
            completed_at
          `)
          .eq("user_id", authAssignment.user_id)
          .eq("role", "trainee")
          .in("course_id", courseIds);

        const courseStatusMap = new Map();
        courseAssignments?.forEach(ca => {
          courseStatusMap.set(ca.course_id, {
            status: ca.assignment_status,
            completedAt: ca.completed_at
          });
        });

        // Check completion status for each course
        const courseStatuses = authCourses.map(ac => {
          const courseStatus = courseStatusMap.get(ac.course_id);
          return {
            courseTitle: ac.courses?.title,
            status: courseStatus?.status || "not_assigned",
            completed: courseStatus?.status === "completed"
          };
        });

        const totalCourses = authCourses.length;
        const completedCourses = courseStatuses.filter(cs => cs.completed).length;
        const allCompleted = completedCourses === totalCourses;

        // Determine what the status should be
        let expectedStatus = "assigned";
        if (allCompleted) {
          expectedStatus = "pending_approval";
        } else if (completedCourses > 0) {
          expectedStatus = "in_progress";
        }

        diagnosticResults.push({
          user: userProfile?.full_name || authAssignment.user_id,
          email: userProfile?.email,
          authorization: authorization?.title || authAssignment.authorisation_id,
          authId: authAssignment.authorisation_id,
          userId: authAssignment.user_id,
          currentStatus: authAssignment.assignment_status,
          expectedStatus: expectedStatus,
          progress: `${completedCourses}/${totalCourses}`,
          allCompleted: allCompleted,
          shouldBePending: allCompleted && authAssignment.assignment_status !== "completed",
          completedAt: authAssignment.completed_at,
          approvedAt: authAssignment.approved_at,
          courses: courseStatuses,
          needsFix: authAssignment.assignment_status !== expectedStatus && 
                   authAssignment.assignment_status !== "completed"
        });
      }

      // Count issues
      const needsPendingApproval = diagnosticResults.filter(r => r.shouldBePending).length;
      const needsStatusUpdate = diagnosticResults.filter(r => r.needsFix).length;

      setStatus(`Diagnosis complete. Found ${needsPendingApproval} authorizations that should be pending approval, ${needsStatusUpdate} need status updates.`);
      setResults(diagnosticResults);

    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStatus("Error occurred during diagnosis");
    } finally {
      setLoading(false);
    }
  };

  const fixAuthorization = async (userId: string, authId: string, expectedStatus: string) => {
    try {
      const supabase = supabaseBrowser;
      
      // Only include assignment_status and completed_at to avoid schema cache issues
      const updateData: any = {
        assignment_status: expectedStatus
      };

      if (expectedStatus === 'pending_approval') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("authorisation_assignments")
        .update(updateData)
        .eq("user_id", userId)
        .eq("authorisation_id", authId)
        .eq("role", "trainee");

      if (error) throw error;

      // Refresh the diagnosis
      await diagnoseAuthorizations();
    } catch (err: any) {
      console.error("Fix error:", err);
      alert(`Error fixing authorization: ${err.message}`);
    }
  };

  const fixAllIssues = async () => {
    const toFix = results.filter(r => r.needsFix && r.currentStatus !== "completed");
    
    for (const item of toFix) {
      await fixAuthorization(item.userId, item.authId, item.expectedStatus);
    }
  };

  const runComprehensiveFix = async () => {
    setLoading(true);
    setStatus("Running comprehensive fix for all missing authorization assignments...");
    setError(null);
    
    try {
      const response = await fetch('/api/fix-authorization-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus(`Successfully fixed ${data.summary.total} authorization assignments (${data.summary.created} created, ${data.summary.updated_to_pending} updated to pending)`);
        // Run diagnosis again to show updated results
        await diagnoseAuthorizations();
      } else {
        setError(data.error || "Failed to run comprehensive fix");
      }
    } catch (err: any) {
      setError(`Error running comprehensive fix: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Diagnose Authorization Status Issues</h1>
        <Link href="/app/admin?tab=pending_authorisations" className="text-sm text-blue-600 hover:underline">
          View Pending Authorisations →
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Authorization Status Diagnostic Tool</h2>
          <p className="text-sm text-gray-600">
            This tool will check all authorization assignments and identify:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Authorizations where all courses are completed but status is not "pending_approval"</li>
            <li>Authorizations with incorrect progress status</li>
            <li>Missing or mismatched completion data</li>
            <li>Missing authorization assignments for users enrolled in related courses</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            <strong>Comprehensive Fix:</strong> Creates missing authorization assignments for all users who are enrolled in courses that are part of authorizations, and updates status to pending_approval if all courses are completed.
          </p>
        </div>

        <div className="pt-4 border-t flex gap-3">
          <button
            onClick={diagnoseAuthorizations}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              loading 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Diagnosing..." : "Run Diagnosis"}
          </button>

          {results.some(r => r.needsFix) && (
            <button
              onClick={fixAllIssues}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              Fix All Issues
            </button>
          )}
          
          <button
            onClick={runComprehensiveFix}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            {loading ? "Fixing..." : "Comprehensive Fix (All Users)"}
          </button>
        </div>

        {status && (
          <div className="mt-4 p-3 rounded-md bg-blue-50 text-blue-700 text-sm">
            {status}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
            Error: {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-semibold">Diagnostic Results:</h3>
            
            {/* Show issues that need fixing first */}
            {results.filter(r => r.shouldBePending || r.needsFix).length > 0 && (
              <>
                <h4 className="text-sm font-medium text-red-600">Issues Found:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Authorization</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expected Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.filter(r => r.shouldBePending || r.needsFix).map((result, idx) => (
                        <tr key={idx} className="bg-red-50">
                          <td className="px-4 py-2 text-sm">
                            <div>{result.user}</div>
                            <div className="text-xs text-gray-500">{result.email}</div>
                          </td>
                          <td className="px-4 py-2 text-sm">{result.authorization}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className="px-2 py-1 rounded text-xs bg-gray-200">
                              {result.currentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <span className="px-2 py-1 rounded text-xs bg-green-200">
                              {result.expectedStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">{result.progress}</td>
                          <td className="px-4 py-2 text-sm">
                            {result.shouldBePending ? "Should be pending approval" : 
                             result.needsFix ? "Status mismatch" : "-"}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {result.currentStatus !== "completed" && (
                              <button
                                onClick={() => fixAuthorization(result.userId, result.authId, result.expectedStatus)}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              >
                                Fix
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Show course details for issues */}
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium">Course Details for Issues:</h4>
                  {results.filter(r => r.shouldBePending || r.needsFix).map((result, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded text-xs">
                      <div className="font-medium">{result.user} - {result.authorization}:</div>
                      <div className="mt-1 space-y-1">
                        {result.courses?.map((course: any, cIdx: number) => (
                          <div key={cIdx} className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${course.completed ? 'bg-green-500' : 'bg-gray-300'}`}/>
                            <span>{course.courseTitle}: {course.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Show OK authorizations */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">
                Authorizations with correct status ({results.filter(r => !r.shouldBePending && !r.needsFix).length})
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1 text-left">User</th>
                      <th className="px-3 py-1 text-left">Authorization</th>
                      <th className="px-3 py-1 text-left">Status</th>
                      <th className="px-3 py-1 text-left">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter(r => !r.shouldBePending && !r.needsFix).map((result, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1">{result.user}</td>
                        <td className="px-3 py-1">{result.authorization}</td>
                        <td className="px-3 py-1">{result.currentStatus}</td>
                        <td className="px-3 py-1">{result.progress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}