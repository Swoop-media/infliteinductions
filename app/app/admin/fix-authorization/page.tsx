// @ts-nocheck
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function FixAuthorizationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleFix = async () => {
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      // Call the API to manually trigger authorization check
      const response = await fetch('/api/check-authorization-completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551', // test user
          courseId: '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e' // INFLITE Driver Training course
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to check authorization');
      }

      const pendingAuth = result.authorizations?.find(a => a.assignment_status === 'pending_approval');
      
      if (pendingAuth) {
        setMessage(`Success! Authorization "${pendingAuth.authorisations.title}" is now pending approval.`);
        setTimeout(() => {
          router.push('/app/admin?tab=pending_authorisations');
        }, 2000);
      } else {
        setMessage('Authorization checked. Status may already be correct or not all courses are complete.');
      }

    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Failed to update authorization status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Fix Authorization Status
          </CardTitle>
          <CardDescription>
            Manually trigger authorization completion check
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800">
                    <strong>Current Issue:</strong> The course is marked as completed, but the authorization hasn't moved to pending approval.
                  </p>
                  <p className="text-sm text-blue-700 mt-2">
                    This will manually run the authorization completion check to fix the status.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-800">
                <strong>User:</strong> test user (inductions@inflite.nz)<br />
                <strong>Course:</strong> INFLITE Driver Training and Vehicle induction<br />
                <strong>Authorization:</strong> INFLITE Driver Authorisation
              </p>
            </div>

            {message && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">{message}</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button 
                onClick={handleFix}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? 'Checking...' : 'Fix Authorization Status'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}