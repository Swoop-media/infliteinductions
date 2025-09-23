'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncAuthorizationsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSync = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/sync-completed-authorizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to sync authorizations');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Sync error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Sync Completed Authorizations
          </h1>
          
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              This utility will scan for users who have completed all courses in their authorizations 
              but haven't been moved to "pending approval" status yet. This is useful for handling 
              existing completed authorizations after system updates.
            </p>
            
            <p className="text-sm text-gray-500">
              This action will:
            </p>
            <ul className="list-disc pl-6 text-sm text-gray-500 mb-4">
              <li>Check all active authorization assignments</li>
              <li>Verify if all required courses are completed</li>
              <li>Update completed authorizations to "pending approval" status</li>
              <li>Make them appear in the pending authorizations review list</li>
            </ul>
          </div>

          <button
            onClick={handleSync}
            disabled={isLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Syncing...' : 'Start Sync'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-md mb-4">
                <p className="text-green-700 font-medium">
                  {result.message}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Checked: {result.totalChecked} authorization assignments
                </p>
              </div>

              {result.updated && result.updated.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium text-gray-900 mb-3">
                    Updated Authorizations:
                  </h3>
                  <div className="space-y-2">
                    {result.updated.map((item: any, index: number) => (
                      <div key={index} className="bg-white p-3 rounded border border-gray-200">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.user_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              Authorization: {item.authorization_name}
                            </p>
                          </div>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending Approval
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.updated && result.updated.length === 0 && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-gray-600">
                    No authorizations needed updating. All completed authorizations are already in the correct status.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => router.push('/app/admin')}
              className="text-blue-600 hover:text-blue-700"
            >
              ← Back to Admin Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}