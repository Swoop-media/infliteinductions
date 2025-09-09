// @ts-nocheck

"use client";

import { useState } from "react";

export default function TestFlowPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [step, setStep] = useState<string>("");

  const testUserId = "aaaf24e3-9b9b-41d2-ac52-220d1ee25551"; // trainee
  const testCourseId = "c7e65bae-bb3d-49d0-b992-fe4c09b15451";

  const runTest = async (testStep: string) => {
    setLoading(true);
    setStep(testStep);
    setResults(null);

    try {
      const response = await fetch("/api/debug/test-multi-role-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId,
          courseId: testCourseId,
          step: testStep
        })
      });

      const data = await response.json();
      setResults(data);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const checkCompletion = async () => {
    setLoading(true);
    setStep("check");
    setResults(null);

    try {
      const response = await fetch(`/api/debug/check-learner-completion?userId=${testUserId}&courseId=${testCourseId}`);
      const data = await response.json();
      setResults(data);
    } catch (error: any) {
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Test Onsite Training Flow</h1>
        <p className="text-sm text-gray-600 mt-2">
          Test the complete flow: trainee completes digital modules → onsite trainers get notified → training appears in train-assess
        </p>
        <div className="mt-3 text-sm">
          <p><strong>Test Trainee:</strong> {testUserId}</p>
          <p><strong>Test Course:</strong> {testCourseId}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Test Steps</h2>
          
          <div className="space-y-3">
            <button
              onClick={() => runTest("1_complete_digital")}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && step === "1_complete_digital" ? "Processing..." : "1. Complete Digital Modules"}
            </button>

            <button
              onClick={checkCompletion}
              disabled={loading}
              className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading && step === "check" ? "Checking..." : "2. Check Completion Status"}
            </button>

            <button
              onClick={() => runTest("2_check_assignments")}
              disabled={loading}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading && step === "2_check_assignments" ? "Checking..." : "3. Assign Onsite Trainer"}
            </button>

            <button
              onClick={() => runTest("3_trigger_notifications")}
              disabled={loading}
              className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {loading && step === "3_trigger_notifications" ? "Creating..." : "4. Create Notification"}
            </button>
          </div>

          <div className="mt-6 space-y-2">
            <h3 className="text-md font-medium">Quick Access Links:</h3>
            <div className="space-y-1 text-sm">
              <a 
                href="/app/train-assess" 
                target="_blank"
                className="block text-blue-600 hover:underline"
              >
                → Train & Assess Page (where trainers see pending training)
              </a>
              <a 
                href="/app/admin/debug-notifications" 
                target="_blank"
                className="block text-blue-600 hover:underline"
              >
                → Debug Notifications Page
              </a>
              <a 
                href={`/api/debug/notification-flow?userId=${testUserId}&courseId=${testCourseId}`}
                target="_blank"
                className="block text-blue-600 hover:underline"
              >
                → Debug Notification Flow
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium">Results</h2>
          
          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-blue-800">Running step: {step}...</p>
            </div>
          )}

          {results && (
            <div className="bg-gray-50 border rounded p-4">
              <h3 className="font-medium mb-2">Test Results:</h3>
              <pre className="text-xs overflow-auto bg-white p-3 rounded border">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
        <h3 className="font-medium text-yellow-800 mb-2">Expected Flow:</h3>
        <ol className="text-sm text-yellow-700 space-y-1">
          <li>1. Trainee completes all digital modules</li>
          <li>2. Database trigger fires and creates notifications for onsite trainers</li>
          <li>3. Onsite trainers see notification and training appears in train-assess</li>
          <li>4. Trainers can conduct onsite training and mark it complete</li>
        </ol>
      </div>

      <div className="bg-gray-50 border rounded p-4">
        <h3 className="font-medium mb-2">What to Check:</h3>
        <ul className="text-sm space-y-1">
          <li>• After step 1: Check if notifications were created for Henry Morgan (trainer)</li>
          <li>• After step 2: Verify completion status shows all digital modules done</li>
          <li>• After step 3: Confirm Henry Morgan has onsite_trainer assignment</li>
          <li>• Visit train-assess page to see if pending training appears</li>
        </ul>
      </div>
    </div>
  );
}
