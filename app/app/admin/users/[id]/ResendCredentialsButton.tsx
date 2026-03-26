"use client";

import { useState } from "react";

export default function ResendCredentialsButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);

  const handleResend = async () => {
    if (!confirm(`This will generate a new temporary password and send it to ${userEmail}. Continue?`)) {
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/resend-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ message: data.error || "Failed to resend credentials", type: "error" });
      } else if (data.emailFailed) {
        setResult({ 
          message: `Email failed to send. Temp password: ${data.tempPassword}`, 
          type: "warning" 
        });
      } else {
        setResult({ message: data.message || "Credentials sent successfully", type: "success" });
      }
    } catch (err: any) {
      setResult({ message: err.message || "Failed to resend credentials", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={handleResend}
        disabled={loading}
        className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Sending..." : "Resend Login Credentials"}
      </button>
      {result && (
        <span className={`text-sm ${
          result.type === "success" ? "text-green-600" : 
          result.type === "warning" ? "text-orange-600" : 
          "text-red-600"
        }`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
