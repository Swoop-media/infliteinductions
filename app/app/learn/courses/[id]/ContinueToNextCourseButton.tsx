'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ContinueToNextCourseButtonProps {
  currentCourseId: string;
  authorizationId?: string;
  nextCourseInAuth?: {
    course_id: string;
    courses: { title: string };
  } | null;
  isModuleOnsite: boolean;
  isCourseComplete: boolean;
}

export default function ContinueToNextCourseButton({
  currentCourseId,
  authorizationId,
  nextCourseInAuth,
  isModuleOnsite,
  isCourseComplete
}: ContinueToNextCourseButtonProps) {
  const [loading, setLoading] = useState(false);
  const [nextDestination, setNextDestination] = useState<{
    type: 'course' | 'authorization' | 'none';
    id?: string;
    title?: string;
  }>({ type: 'none' });
  const router = useRouter();

  useEffect(() => {
    // Only check for next destination if we need to show the button
    if (isModuleOnsite || isCourseComplete) {
      checkNextDestination();
    }
  }, [currentCourseId, authorizationId, isModuleOnsite, isCourseComplete]);

  const checkNextDestination = async () => {
    // If there's a next course in the current authorization, use that
    if (nextCourseInAuth) {
      setNextDestination({
        type: 'course',
        id: nextCourseInAuth.course_id,
        title: nextCourseInAuth.courses.title
      });
      return;
    }

    // Otherwise, check for other in-progress authorizations or courses
    setLoading(true);
    try {
      const response = await fetch('/api/learn/next-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCourseId,
          currentAuthorizationId: authorizationId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setNextDestination(data);
      }
    } catch (error) {
      console.error('Error fetching next course:', error);
    } finally {
      setLoading(false);
    }
  };

  // Don't show button if neither condition is met
  if (!isModuleOnsite && !isCourseComplete) {
    return null;
  }

  // Don't show if there's no next destination
  if (nextDestination.type === 'none' && !loading && !nextCourseInAuth) {
    return null;
  }

  const handleContinue = () => {
    if (nextCourseInAuth) {
      // Navigate to next course in authorization
      router.push(`/app/learn/courses/${nextCourseInAuth.course_id}?auth=${authorizationId}`);
    } else if (nextDestination.type === 'course') {
      // Navigate to next course (possibly in a different authorization)
      const url = nextDestination.id 
        ? `/app/learn/courses/${nextDestination.id}${
            authorizationId ? `?auth=${authorizationId}` : ''
          }`
        : '/app/myprofile';
      router.push(url);
    } else if (nextDestination.type === 'authorization') {
      // Navigate to my profile to see the next authorization
      router.push('/app/myprofile');
    } else {
      // No next course found, go to profile
      router.push('/app/myprofile');
    }
  };

  // Determine button text and style based on context
  const getButtonContent = () => {
    if (loading) {
      return (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Finding next course...
        </>
      );
    }

    if (nextCourseInAuth) {
      return (
        <>
          Continue to {nextCourseInAuth.courses.title}
          <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </>
      );
    }

    if (nextDestination.type === 'course' && nextDestination.title) {
      return (
        <>
          Continue to {nextDestination.title}
          <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </>
      );
    }

    if (nextDestination.type === 'authorization') {
      return (
        <>
          Continue to Next Authorization
          <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </>
      );
    }

    return (
      <>
        Continue to Next Course
        <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </>
    );
  };

  // For onsite modules, show a different style
  if (isModuleOnsite && !isCourseComplete) {
    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-blue-900">While waiting for your session...</h4>
            <p className="text-sm text-blue-700">
              You can continue with another course in your training
            </p>
          </div>
          <button
            onClick={handleContinue}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {getButtonContent()}
          </button>
        </div>
      </div>
    );
  }

  // For completed courses
  return (
    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-green-900">Course Complete!</h4>
          <p className="text-sm text-green-700">
            {nextCourseInAuth || nextDestination.type === 'course' 
              ? 'Ready for the next course in your training'
              : 'Continue your learning journey'}
          </p>
        </div>
        <button
          onClick={handleContinue}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {getButtonContent()}
        </button>
      </div>
    </div>
  );
}