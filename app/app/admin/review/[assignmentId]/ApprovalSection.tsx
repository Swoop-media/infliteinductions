'use client';

import { useState } from 'react';
import ExpiryPreview from './ExpiryPreview';

interface ApprovalSectionProps {
  assignmentId: string;
  authValidForDays: number | null;
  documents: Array<{
    expires_on: string | null;
    title?: string;
  }>;
  courses: Array<{
    course_title: string;
    valid_for_months?: number | null;
  }>;
  approveAction: (formData: FormData) => Promise<void>;
}

export default function ApprovalSection({
  assignmentId,
  authValidForDays,
  documents,
  courses,
  approveAction,
}: ApprovalSectionProps) {
  const [customExpiryDate, setCustomExpiryDate] = useState<string | null>(null);

  return (
    <>
      <ExpiryPreview
        authValidForDays={authValidForDays}
        documents={documents}
        courses={courses}
        onCustomExpiryChange={setCustomExpiryDate}
      />

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Review Actions</h2>
        <form action={approveAction} className="flex gap-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          {customExpiryDate && (
            <input type="hidden" name="custom_expiry_date" value={customExpiryDate} />
          )}
          <button className="rounded-md bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700">
            Approve Authorisation
          </button>
        </form>
        {customExpiryDate && (
          <p className="text-xs text-amber-600 mt-2">
            Using custom expiry date: {new Date(customExpiryDate).toLocaleDateString('en-NZ', { dateStyle: 'medium' })}
          </p>
        )}
        {!customExpiryDate && (
          <p className="text-xs text-gray-500 mt-2">
            Expiry date will be calculated automatically based on the earliest of document, course, or authorization validity.
          </p>
        )}
      </div>
    </>
  );
}
