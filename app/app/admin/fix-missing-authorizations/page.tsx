// @ts-nocheck
"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

export default function FixMissingAuthorizationsPage() {
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeAndFix = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setStatus("Starting analysis...");

    try {
      const supabase = supabaseBrowser;
      const fixResults = [];

      // Step 1: Find all users with course assignments that are part of authorizations
      setStatus("Finding users with courses in authorizations...");
      
      const { data: authCourses, error: authCoursesError } = await supabase
        .from("authorisation_courses")
        .select(`
          authorisation_id,
          course_id,
          authorisations!inner(
            id,
            title
          )
        `);

      if (authCoursesError) throw authCoursesError;

      if (!authCourses || authCourses.length === 0) {
        setStatus("No authorizations with courses found. Please create authorizations first.");
        return;
      }

      // Group courses by authorization
      const authToCourses = new Map();
      authCourses.forEach(ac => {
        const courses = authToCourses.get(ac.authorisation_id) || [];
        courses.push(ac.course_id);
        authToCourses.set(ac.authorisation_id, courses);
      });

      setStatus(`Found ${authToCourses.size} authorizations with courses`);

      // Step 2: Find users enrolled in these courses
      const { data: courseAssignments, error: assignError } = await supabase
        .from("course_assignments")
        .select(`
          id,
          user_id,
          course_id,
          assignment_status,
          completed_at,
          profiles!inner(
            id,
            full_name,
            email
          )
        `)
        .eq("role", "trainee");

      if (assignError) throw assignError;

      // Step 3: Check which users should have authorization assignments
      const userAuthMap = new Map(); // Map of user_id -> authorization_id -> courses

      courseAssignments?.forEach(ca => {
        authToCourses.forEach((courseIds, authId) => {
          if (courseIds.includes(ca.course_id)) {
            if (!userAuthMap.has(ca.user_id)) {
              userAuthMap.set(ca.user_id, new Map());
            }
            const userAuths = userAuthMap.get(ca.user_id);
            if (!userAuths.has(authId)) {
              userAuths.set(authId, []);
            }
            userAuths.get(authId).push({
              courseId: ca.course_id,
              status: ca.assignment_status,
              completedAt: ca.completed_at
            });
          }
        });
      });

      setStatus(`Found ${userAuthMap.size} users with courses in authorizations`);

      // Step 4: Check existing authorization assignments
      const { data: existingAuthAssignments } = await supabase
        .from("authorisation_assignments")
        .select("user_id, authorisation_id, assignment_status");

      const existingMap = new Map();
      existingAuthAssignments?.forEach(aa => {
        const key = `${aa.user_id}-${aa.authorisation_id}`;
        existingMap.set(key, aa);
      });

      // Step 5: Create missing authorization assignments and update statuses
      let created = 0;
      let updated = 0;

      for (const [userId, authsMap] of userAuthMap) {
        for (const [authId, courses] of authsMap) {
          const key = `${userId}-${authId}`;
          const existing = existingMap.get(key);
          
          // Check if all courses are completed
          const totalCourses = authToCourses.get(authId).length;
          const completedCourses = courses.filter(c => c.status === 'completed').length;
          const allCompleted = completedCourses === totalCourses && totalCourses > 0;
          
          // Determine the correct status
          let targetStatus = 'in_progress';
          if (allCompleted) {
            targetStatus = 'pending_approval';
          } else if (completedCourses === 0) {
            targetStatus = 'assigned';
          }

          const authInfo = authCourses.find(ac => ac.authorisation_id === authId);
          const userInfo = courseAssignments?.find(ca => ca.user_id === userId);

          if (!existing) {
            // Create new authorization assignment
            const { error: createError } = await supabase
              .from("authorisation_assignments")
              .insert({
                user_id: userId,
                authorisation_id: authId,
                role: 'trainee',
                assignment_status: targetStatus,
                assigned_by: null,
                assigned_at: new Date().toISOString(),
                completed_at: allCompleted ? new Date().toISOString() : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (!createError) {
              created++;
              fixResults.push({
                action: 'CREATED',
                user: userInfo?.profiles?.full_name || userId,
                authorization: authInfo?.authorisations?.title || authId,
                status: targetStatus,
                progress: `${completedCourses}/${totalCourses} courses completed`
              });
            } else {
              console.error('Create error:', createError);
            }
          } else if (existing.assignment_status !== targetStatus) {
            // Update existing assignment status
            const { error: updateError } = await supabase
              .from("authorisation_assignments")
              .update({
                assignment_status: targetStatus,
                completed_at: allCompleted ? new Date().toISOString() : existing.completed_at,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", userId)
              .eq("authorisation_id", authId);

            if (!updateError) {
              updated++;
              fixResults.push({
                action: 'UPDATED',
                user: userInfo?.profiles?.full_name || userId,
                authorization: authInfo?.authorisations?.title || authId,
                oldStatus: existing.assignment_status,
                newStatus: targetStatus,
                progress: `${completedCourses}/${totalCourses} courses completed`
              });
            } else {
              console.error('Update error:', updateError);
            }
          } else {
            fixResults.push({
              action: 'NO_CHANGE',
              user: userInfo?.profiles?.full_name || userId,
              authorization: authInfo?.authorisations?.title || authId,
              status: existing.assignment_status,
              progress: `${completedCourses}/${totalCourses} courses completed`
            });
          }
        }
      }

      setStatus(`Complete! Created ${created} new assignments, updated ${updated} existing ones.`);
      setResults(fixResults);

    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An error occurred");
      setStatus("Error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fix Missing Authorization Assignments</h1>
        <Link href="/app/admin" className="text-sm text-blue-600 hover:underline">
          ← Back to Admin
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">About This Tool</h2>
          <p className="text-sm text-gray-600">
            This tool will:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Find all users enrolled in courses that are part of authorizations</li>
            <li>Create missing authorization assignment records</li>
            <li>Update authorization statuses based on course completion</li>
            <li>Move completed authorizations to "pending_approval" status</li>
          </ul>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={analyzeAndFix}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              loading 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Processing..." : "Analyze and Fix Authorization Assignments"}
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
            <h3 className="font-semibold">Results:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Action
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      User
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Authorization
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Progress
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((result, idx) => (
                    <tr key={idx} className={
                      result.action === 'CREATED' ? 'bg-green-50' :
                      result.action === 'UPDATED' ? 'bg-blue-50' :
                      ''
                    }>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          result.action === 'CREATED' ? 'bg-green-200 text-green-800' :
                          result.action === 'UPDATED' ? 'bg-blue-200 text-blue-800' :
                          'bg-gray-200 text-gray-800'
                        }`}>
                          {result.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">{result.user}</td>
                      <td className="px-4 py-2 text-sm">{result.authorization}</td>
                      <td className="px-4 py-2 text-sm">
                        {result.action === 'UPDATED' ? (
                          <span>
                            {result.oldStatus} → {result.newStatus}
                          </span>
                        ) : (
                          result.status || result.newStatus
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm">{result.progress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}