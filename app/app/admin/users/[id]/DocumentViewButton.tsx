// @ts-nocheck

'use client';

import { useState } from 'react';
import { openSignedDocument } from '@/lib/openSignedDocument';

interface DocumentViewButtonProps {
  filePath: string;
  title: string;
}

export function DocumentViewButton({ filePath, title }: DocumentViewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<{ message: string; url?: string } | null>(null);

  const handleView = async () => {
    setLoading(true);
    setIssue(null);

    const result = await openSignedDocument(async () => {
      // Create a signed URL for the document
      const response = await fetch('/api/admin/document-view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
        throw new Error('Failed to access document');
      }

      const { signedUrl } = await response.json();
      return signedUrl;
    });

    if (!result.ok) {
      console.error('Error viewing document:', result.message);
      setIssue({ message: result.message, url: result.url });
    }
    setLoading(false);
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleView}
        disabled={loading}
        className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'View'}
      </button>
      {issue && (
        <span className="text-xs text-amber-700">
          {issue.message}{' '}
          {issue.url && (
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 underline"
            >
              Open {title}
            </a>
          )}
        </span>
      )}
    </span>
  );
}
