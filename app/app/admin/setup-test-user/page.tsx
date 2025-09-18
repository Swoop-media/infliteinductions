// @ts-nocheck
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, CheckCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SetupTestUserPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const router = useRouter();

  const handleSetup = async () => {
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      // Assign user to course and authorization
      const response = await fetch('/api/assign-user-to-course-and-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign user');
      }

      setStatus(result);
      setMessage('User successfully assigned to course and authorization! Now they can start the training.');
      
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to setup test user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    try {
      const response = await fetch('/api/test-authorization-status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('Check error:', err);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Setup Test User Assignments
          </CardTitle>
          <CardDescription>
            Assign the test user to the course and authorization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">
                    Current Issue: Test user has no assignments
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    The reset cleared all assignments. We need to re-assign the user to:
                  </p>
                  <ul className="text-sm text-amber-700 mt-2 list-disc list-inside">
                    <li>Course: INFLITE Driver Training and Vehicle induction</li>
                    <li>Authorization: INFLITE Driver Authorisation</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Test User:</strong> inductions@inflite.nz<br />
                <strong>User ID:</strong> aaaf24e3-9b9b-41d2-ac52-220d1ee25551
              </p>
            </div>

            {message && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <p className="text-sm text-green-800">{message}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {status && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-800 font-medium mb-2">Current Status:</p>
                {status.course && (
                  <p className="text-sm text-gray-700">
                    <strong>Course:</strong> {status.course.status || status.testCourse?.status || 'Not assigned'}
                  </p>
                )}
                {status.authorization && (
                  <p className="text-sm text-gray-700">
                    <strong>Authorization:</strong> {status.authorization.status || status.authorizationAssignment?.status || 'Not assigned'}
                  </p>
                )}
                {status.authorization?.totalCourses !== undefined && (
                  <p className="text-sm text-gray-700">
                    <strong>Progress:</strong> {status.authorization.completedCourses} of {status.authorization.totalCourses} courses completed
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button 
                onClick={handleSetup}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? 'Assigning...' : 'Assign User to Course & Authorization'}
              </Button>
              <Button 
                variant="outline"
                onClick={handleCheckStatus}
                disabled={isLoading}
              >
                Check Status
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.push('/app/train-assess')}
                disabled={isLoading}
              >
                Go to Training
              </Button>
            </div>

            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-800 font-medium mb-2">Next Steps:</p>
              <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
                <li>Click "Assign User" to create the assignments</li>
                <li>Go to Train & Assess as a trainer</li>
                <li>Select the test user and course</li>
                <li>Complete all training modules</li>
                <li>Complete all assessment modules</li>
                <li>The authorization will automatically move to pending when all courses are complete</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}