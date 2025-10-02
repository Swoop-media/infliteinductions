"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RetakeButtonProps {
  type: "course" | "authorization";
  courseId?: string;
  authorizationId?: string;
  courseTitle?: string;
  authTitle?: string;
}

export default function RetakeButton({ 
  type, 
  courseId, 
  authorizationId,
  courseTitle,
  authTitle
}: RetakeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRetake = async () => {
    const confirmMessage = type === "course" 
      ? `Are you sure you want to retake "${courseTitle || 'this course'}"? This will create a new assignment and you'll start fresh from the beginning. Your previous completion record will be preserved.`
      : `Are you sure you want to retake "${authTitle || 'this authorization'}"? This will create new assignments for all included courses and you'll start fresh from the beginning. Your previous completion records will be preserved.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/retake-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          courseId,
          authorizationId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create retake assignment');
      }

      // Navigate to the appropriate learning page
      if (type === "course" && courseId) {
        router.push(`/app/learn/courses/${courseId}`);
      } else if (type === "authorization" && authorizationId) {
        router.push(`/app/learn/authorisations/${authorizationId}`);
      } else {
        // Just refresh the current page to show the new assignment
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to retake:', error);
      setError(error instanceof Error ? error.message : 'Failed to create retake assignment');
      
      // If there's an error about existing assignment, refresh the page
      if (error instanceof Error && error.message.includes('active assignment')) {
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleRetake}
        disabled={loading}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Start a fresh attempt of this ${type}`}
      >
        {loading ? (
          <>
            <svg className="inline-block w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating...
          </>
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