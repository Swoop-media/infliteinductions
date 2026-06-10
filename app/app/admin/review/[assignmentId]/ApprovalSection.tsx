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
  currentAuthTitle: string;
  missingConnectedAuthorisations: Array<{
    title: string;
    status: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  completed: 'Completed',
  approved: 'Approved',
  expired: 'Expired',
  revoked: 'Revoked',
  not_assigned: 'Not Assigned',
};

export default function ApprovalSection({
  assignmentId,
  authValidForDays,
  documents,
  courses,
  approveAction,
  currentAuthTitle,
  missingConnectedAuthorisations,
}: ApprovalSectionProps) {
  const [customExpiryDate, setCustomExpiryDate] = useState<string | null>(null);
  const [restrictions, setRestrictions] = useState('');

  return (
    <>
      {missingConnectedAuthorisations.length > 0 && (
        <div className="rounded-lg bg-orange-50 border border-orange-300 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="min-w-0">
              <h3 className="font-medium text-orange-900">
                Connected authorisations not held
              </h3>
              <p className="mt-1 text-sm text-orange-800">
                <span className="font-medium">{currentAuthTitle}</span> is connected (in the
                Connected Authorisation Map) to the following authorisation
                {missingConnectedAuthorisations.length === 1 ? '' : 's'} that this learner does
                not currently hold (approved/completed). This is a heads-up only — you can still
                approve.
              </p>
              <ul className="mt-3 space-y-1.5">
                {missingConnectedAuthorisations.map((a) => (
                  <li
                    key={a.title}
                    className="flex items-center justify-between gap-3 rounded-md border border-orange-200 bg-white px-3 py-2"
                  >
                    <span className="truncate text-sm font-medium text-gray-900">{a.title}</span>
                    <span className="flex-shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="font-medium text-amber-900">Restrictions and Comments</h3>
        </div>
        <textarea
          value={restrictions}
          onChange={(e) => setRestrictions(e.target.value)}
          placeholder="List any restrictions or comments for this authorisation (e.g., limited to specific aircraft, daylight hours only, supervised operations)..."
          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        />
        <p className="text-xs text-amber-700 mt-1">
          These restrictions will be visible to the user and on all authorisation records.
        </p>
      </div>

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
          <input type="hidden" name="restrictions" value={restrictions} />
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
