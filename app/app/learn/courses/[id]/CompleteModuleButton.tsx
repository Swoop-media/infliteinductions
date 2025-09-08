
'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CompleteModuleButtonProps {
  assignmentId: string;
  moduleId: string;
  courseId: string;
  authorizationId?: string;
}

export default function CompleteModuleButton({ 
  assignmentId, 
  moduleId, 
  courseId, 
  authorizationId 
}: CompleteModuleButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleComplete = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/assignment/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId,
          moduleId,
          completed: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to complete module');
      }

      // Success - refresh the page to show updated progress and handle next module navigation
      router.refresh();
    } catch (error) {
      console.error('Failed to complete module:', error);
      
      // Redirect with error message
      const params = new URLSearchParams();
      params.set('module', moduleId);
      params.set('error', 'completion_failed');
      if (authorizationId) {
        params.set('auth', authorizationId);
      }

      router.push(`/app/learn/courses/${courseId}?${params.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleComplete}
      disabled={loading}
      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Completing...
        </>
      ) : (
        'Complete & Continue →'
      )}
    </button>
  );
}
