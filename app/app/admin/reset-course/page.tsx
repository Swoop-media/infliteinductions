// @ts-nocheck
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ResetCoursePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset the course progress for test user? This will clear all their training and assessment data.')) {
      return;
    }

    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      // These are the IDs from your system - the test user and their course assignment
      const response = await fetch('/api/reset-course-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: '34a0bdf1-59c0-49b2-9ddc-c2529fa61d6a', // The assignment shown in your logs
          courseId: '4a25c12d-fc4f-4eae-8053-e1b0bff5d27e', // INFLITE Driver Training course
          userId: 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551' // test user
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset course progress');
      }

      setMessage('Course progress reset successfully! The user can now start the course again from the beginning.');
      
      // Redirect after 3 seconds
      setTimeout(() => {
        router.push('/app/admin?tab=pending_authorisations');
      }, 3000);

    } catch (err) {
      console.error('Reset error:', err);
      setError(err.message || 'Failed to reset course progress');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5" />
            Reset Course Progress
          </CardTitle>
          <CardDescription>
            Reset training and assessment progress for the test user
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium">
                    This will reset the following:
                  </p>
                  <ul className="text-sm text-yellow-700 mt-2 list-disc list-inside space-y-1">
                    <li>All module progress (training and assessment)</li>
                    <li>All requirement responses</li>
                    <li>All quiz attempts</li>
                    <li>Course completion status</li>
                    <li>Authorization status (back to 'assigned')</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
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
                onClick={handleReset}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700"
              >
                {isLoading ? 'Resetting...' : 'Reset Course Progress'}
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