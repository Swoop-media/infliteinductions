"use client";

import { useState } from "react";

export default function ResetAllProgressButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleReset = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setResult(null);
    setConfirming(false);
    try {
      const res = await fetch("/api/admin-reset-user-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ message: data.error || "Failed to reset", type: "error" });
      } else {
        setResult({ message: "All training progress wiped. Refresh the page to see changes.", type: "success" });
      }
    } catch (err: any) {
      setResult({ message: err.message || "Failed to reset", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleReset}
        disabled={loading}
        className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
          confirming
            ? "bg-red-700 text-white hover:bg-red-800"
            : "bg-red-600 text-white hover:bg-red-700"
        }`}
      >
        {loading ? "Resetting..." : confirming ? "Click again to confirm" : "Reset All Progress"}
      </button>
      {confirming && !loading && (
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      )}
      {result && (
        <span className={`text-sm ${result.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
