// @ts-nocheck
"use client";

import { useState } from "react";

interface PeerReviewPanelProps {
  courseId: string;
  reviewerName: string;
}

export default function PeerReviewPanel({ courseId, reviewerName }: PeerReviewPanelProps) {
  const [open, setOpen] = useState(false);
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/peer-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewDate, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to save your review. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Failed to save your review. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-green-300 bg-green-50 p-4 shadow-lg">
        <div className="flex items-start gap-2">
          <span className="text-lg">✅</span>
          <div>
            <h3 className="text-sm font-semibold text-green-900">Peer review recorded</h3>
            <p className="mt-1 text-xs text-green-800">
              Thanks {reviewerName}. Your review has been saved and will appear on the course page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-purple-700 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-purple-800"
      >
        📝 Complete peer review
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-purple-300 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-purple-900">Peer Review Sign-off</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Minimise"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">Reviewer</label>
          <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-800">
            {reviewerName}
          </div>
        </div>

        <div>
          <label htmlFor="peer-review-date" className="block text-xs font-medium text-gray-700">
            Review date
          </label>
          <input
            id="peer-review-date"
            type="date"
            required
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="peer-review-notes" className="block text-xs font-medium text-gray-700">
            Review notes
          </label>
          <textarea
            id="peer-review-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any feedback about the course content, quiz questions, or onsite requirements..."
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Submit review"}
        </button>
      </form>
    </div>
  );
}
