"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminRetakeButtonProps {
  type: "course" | "authorization";
  userId: string;
  courseId?: string;
  authorizationId?: string;
  courseTitle?: string;
  authTitle?: string;
}

export default function AdminRetakeButton({ 
  type, 
  userId,
  courseId, 
  authorizationId,
  courseTitle,
  authTitle
}: AdminRetakeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRetake = async () => {
    const confirmMessage = type === "course" 
      ? `Are you sure you want to create a retake assignment for "${courseTitle || 'this course'}"? This will create a new assignment for this user and they'll start fresh from the beginning. Their previous completion record will be preserved.`
      : `Are you sure you want to create a retake assignment for "${authTitle || 'this authorization'}"? This will create new assignments for all included courses and the user will start fresh from the beginning. Their previous completion records will be preserved.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin-retake-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          userId,
          courseId,
          authorizationId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create retake assignment');
      }

      // Refresh the page to show the new assignment
      router.refresh();
      
      // Clear any error after successful retake
      setError(null);
    } catch (error) {
      console.error('Failed to create retake assignment:', error);
      setError(error instanceof Error ? error.message : 'Failed to create retake assignment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleRetake}
        disabled={loading}
        className={`
          px-3 py-1.5 text-xs font-medium rounded-md
          ${loading 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 text-white transition-colors'
          }
        `}
        title={type === "course" ? "Create a new assignment for this course" : "Create a new assignment for this authorization"}
      >
        {loading ? (
          <span className="flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating...
          </span>
        ) : (
          'Retake'
        )}
      </button>
      
      {error && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </>
  );
}