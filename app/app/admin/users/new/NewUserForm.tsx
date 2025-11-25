'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AssignmentSections from './AssignmentSections';

interface Props {
  courses: any[];
  authorizations: any[];
  departments: any[];
  jobDescriptions: any[];
}

export default function NewUserForm({ 
  courses, 
  authorizations, 
  departments, 
  jobDescriptions 
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userType, setUserType] = useState<'internal' | 'external'>('internal');
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [selectedAuths, setSelectedAuths] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const fullName = formData.get('full_name') as string;
    const department = formData.get('department') as string;
    const jobDescription = formData.get('job_description') as string;

    // Get selected courses and authorizations from checkboxes
    const courseInputs = e.currentTarget.querySelectorAll('input[name="courses"]:checked');
    const authInputs = e.currentTarget.querySelectorAll('input[name="authorizations"]:checked');
    
    const courseIds = Array.from(courseInputs).map((input: any) => input.value);
    const authIds = Array.from(authInputs).map((input: any) => input.value);

    try {
      if (userType === 'external') {
        const externalUserType = formData.get('external_user_type') as string;
        
        const response = await fetch('/api/admin/create-external-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            fullName,
            userType: externalUserType,
            courseIds,
            authorizationIds: authIds,
            department,
            jobDescription
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create external user');
        }

        router.push('/app/admin?tab=users&success=External user created and email sent');
      } else {
        const response = await fetch('/api/admin/create-internal-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            fullName,
            department,
            jobDescription,
            courseIds,
            authorizationIds: authIds
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create internal user');
        }

        router.push('/app/admin?tab=users&success=Internal user created successfully');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">User Type</h2>
        
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="user_type_selector"
              value="internal"
              checked={userType === 'internal'}
              onChange={(e) => setUserType('internal')}
              className="mr-2"
            />
            <span className="text-sm">Internal Employee (Microsoft Account)</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="user_type_selector"
              value="external"
              checked={userType === 'external'}
              onChange={(e) => setUserType('external')}
              className="mr-2"
            />
            <span className="text-sm">External User (Email/Password)</span>
          </label>
        </div>

        {userType === 'external' && (
          <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
            <p className="font-medium">External User Setup:</p>
            <ul className="mt-1 list-disc list-inside">
              <li>A temporary password will be generated automatically</li>
              <li>The user will receive an email with their login credentials</li>
              <li>They can login using the "Login with Email" option</li>
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">User Information</h2>
        
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="user@company.com"
            />
            <p className="mt-1 text-xs text-gray-500">
              {userType === 'internal' 
                ? 'Must match their Microsoft account email'
                : 'Will be used for login and receiving credentials'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Full Name *
            </label>
            <input
              type="text"
              name="full_name"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>

          {userType === 'external' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                External User Type *
              </label>
              <select
                name="external_user_type"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="">Select Type</option>
                <option value="external_contractor">Contractor (Trainer/Assessor)</option>
                <option value="external_operator">Operator (General User)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Contractors get "Trainers and Assessors" role, Operators get "User" role
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Department
            </label>
            <select
              name="department"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Job Description
            </label>
            <select
              name="job_description"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">Select Job Description</option>
              {jobDescriptions.map((job) => (
                <option key={job.id} value={job.name}>
                  {job.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Assignment sections with department organization - Authorizations first, then Courses */}
      <AssignmentSections 
        authorizations={authorizations}
        courses={courses}
      />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create User'}
        </button>
        <Link
          href="/app/admin?tab=users"
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}