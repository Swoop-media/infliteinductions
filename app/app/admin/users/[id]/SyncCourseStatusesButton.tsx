"use client";

import { useState } from "react";

export default function SyncCourseStatusesButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/sync-course-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ message: data.error || "Failed to sync", type: "error" });
      } else if (data.fixed > 0) {
        setResult({ message: `Fixed ${data.fixed} course assignment(s). Refresh the page to see changes.`, type: "success" });
      } else {
        setResult({ message: "All course statuses are already correct.", type: "success" });
      }
    } catch (err: any) {
      setResult({ message: err.message || "Failed to sync", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Syncing..." : "Sync Course Statuses"}
      </button>
      {result && (
        <span className={`text-sm ${result.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
