// @ts-nocheck
"use client";

import { useState } from "react";
import { Bell, Send, CheckCircle, X, AlertCircle } from "lucide-react";

const notificationTypes = [
  { value: "course_assigned", label: "Course Assigned", description: "Test course assignment notification" },
  { value: "authorization_assigned", label: "Authorization Assigned", description: "Test authorization assignment" },
  { value: "module_rejected", label: "Module Rejected", description: "Test module rejection notification" },
  { value: "authorization_expired", label: "Authorization Expired", description: "Test expired authorization" },
  { value: "retake_reminder", label: "Retake Reminder", description: "Test retake reminder notification" },
  { value: "document_expiry_30", label: "Document Expiry (30 days)", description: "Test 30-day document expiry" },
  { value: "document_expiry_10", label: "Document Expiry (10 days)", description: "Test 10-day document expiry" },
  { value: "document_expiry_daily", label: "Document Expiry (Daily)", description: "Test daily document expiry" },
  { value: "daily_auth_expiry_report", label: "Daily Auth Report", description: "Test daily authorization report" },
  { value: "daily_doc_expiry_report", label: "Daily Document Report", description: "Test daily document report" },
  { value: "authorization_published", label: "Authorization Published", description: "Test authorization published" },
  { value: "onsite_training_ready", label: "Onsite Training Ready", description: "Test onsite training notification" },
  { value: "onsite_assessment_ready", label: "Onsite Assessment Ready", description: "Test onsite assessment notification" }
];

export default function TestNotificationsPage() {
  const [userId, setUserId] = useState("");
  const [notificationType, setNotificationType] = useState("course_assigned");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [runningAll, setRunningAll] = useState(false);
  const [allResult, setAllResult] = useState(null);

  const sendTestNotification = async () => {
    if (!userId.trim()) {
      setError("Please enter a user ID");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId.trim(),
          notificationType,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to send notification");
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAllNotifications = async () => {
    setRunningAll(true);
    setError(null);
    setAllResult(null);

    try {
      const response = await fetch("/api/notifications/run-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      
      if (!response.ok && response.status !== 401) {
        throw new Error(data.error || "Failed to run all notifications");
      }

      setAllResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Notification System Tester</h1>
        <p className="text-gray-600">Test individual notifications or run all scheduled notification jobs</p>
      </div>

      {/* Test Individual Notification */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-center mb-4">
          <Bell className="h-6 w-6 mr-2 text-blue-600" />
          <h2 className="text-xl font-semibold">Test Individual Notification</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">User ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID (e.g., c1e9d86d-2dcc-4c31-a0d9-b3c54f59f936)"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notification Type</label>
            <select
              value={notificationType}
              onChange={(e) => setNotificationType(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {notificationTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} - {type.description}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={sendTestNotification}
            disabled={loading}
            className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Test Notification
              </>
            )}
          </button>
        </div>

        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">Success!</p>
                <p className="text-sm text-green-700 mt-1">{result.message}</p>
                {result.payload && (
                  <details className="mt-2">
                    <summary className="text-sm text-green-600 cursor-pointer">View payload</summary>
                    <pre className="mt-2 text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(result.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Run All Scheduled Jobs */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center mb-4">
          <AlertCircle className="h-6 w-6 mr-2 text-orange-600" />
          <h2 className="text-xl font-semibold">Run All Scheduled Jobs</h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          This will run all scheduled notification checks including document expiry, authorization expiry, retake reminders, and daily admin reports.
        </p>

        <button
          onClick={runAllNotifications}
          disabled={runningAll}
          className="flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {runningAll ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              Running All Jobs...
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" />
              Run All Notification Jobs
            </>
          )}
        </button>

        {allResult && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="font-semibold text-blue-800 mb-2">All Jobs Completed</p>
            <pre className="text-xs text-gray-700 overflow-auto">
              {JSON.stringify(allResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start">
            <X className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h3 className="font-semibold mb-2">Instructions</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>To test individual notifications, enter a valid user ID and select a notification type</li>
          <li>The notification will be sent both in-app and via Teams (if user has linked Teams account)</li>
          <li>To run all scheduled jobs, click "Run All Notification Jobs" - this simulates the daily cron job</li>
          <li>For production use, set up a cron job to POST to /api/notifications/run-all daily</li>
          <li>Set CRON_SECRET environment variable for production security</li>
        </ul>
      </div>
    </div>
  );
}