
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CompleteModuleButtonProps {
  assignmentId: string;
  moduleId: string;
  courseId: string;
  nextModuleId?: string;
  authorizationId?: string;
}

export default function CompleteModuleButton({
  assignmentId,
  moduleId,
  courseId,
  nextModuleId,
  authorizationId,
}: CompleteModuleButtonProps) {
  const router = useRouter();
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = async () => {
    setIsCompleting(true);
    
    try {
      const response = await fetch('/api/assignment/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId,
          moduleId
        })
      });

      if (response.ok) {
        // Redirect to next module or back to course
        const authParam = authorizationId ? `&auth=${authorizationId}` : '';
        if (nextModuleId) {
          router.push(`/app/learn/courses/${courseId}?module=${nextModuleId}${authParam}`);
        } else {
          router.push(`/app/learn/courses/${courseId}${authParam ? `?auth=${authorizationId}` : ''}`);
        }
        router.refresh(); // Refresh to update progress
      } else {
        console.error('Failed to mark module as complete');
        const authParam = authorizationId ? `&auth=${authorizationId}` : '';
        router.push(`/app/learn/courses/${courseId}?error=completion_failed${authParam}`);
      }
    } catch (error) {
      console.error('Error completing module:', error);
      router.push(`/app/learn/courses/${courseId}?error=completion_failed`);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <button
      onClick={handleComplete}
      disabled={isCompleting}
      className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isCompleting ? 'Completing...' : 'Mark as Complete →'}
    </button>
  );
}
