"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminRevokeButtonProps {
  type: "course" | "authorization";
  userId: string;
  courseId?: string;
  authorizationId?: string;
  assignmentId: string;
  courseTitle?: string;
  authTitle?: string;
}

export default function AdminRevokeButton({ 
  type, 
  userId,
  courseId, 
  authorizationId,
  assignmentId,
  courseTitle,
  authTitle
}: AdminRevokeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRevoke = async () => {
    const title = type === "course" ? courseTitle : authTitle;
    const confirmMessage = `You are about to revoke "${title || 'this authorization'}" for this user. \n\n⚠️ WARNING: This action will:\n• Remove the authorization from being current\n• Require the user to be reassigned and complete the training again\n• Remove it from completed and due date lists\n• User's progress will be removed and cannot be undone!\n\nAre you sure you want to do this?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin-revoke-authorization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          userId,
          courseId,
          authorizationId,
          assignmentId,
          reason: `Revoked by admin for ${title}`
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to revoke authorization');
      }

      // Refresh the page to show the updated status
      router.refresh();
      
      // Clear any error after successful revocation
      setError(null);
    } catch (error) {
      console.error('Failed to revoke authorization:', error);
      setError(error instanceof Error ? error.message : 'Failed to revoke authorization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleRevoke}
        disabled={loading}
        className={`
          px-3 py-1.5 text-xs font-medium rounded-md
          ${loading 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
          }
          transition-colors duration-200
        `}
      >
        {loading ? 'Revoking...' : 'Revoke'}
      </button>
      
      {error && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}