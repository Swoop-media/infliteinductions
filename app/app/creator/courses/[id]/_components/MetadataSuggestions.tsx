// @ts-nocheck
"use client";

// "Suggest title & description" panel for the creator Details tab.
//
// Fetches a suggestion from the creator-gated API, shows it side-by-side
// with the current values, and offers per-field Apply buttons that copy the
// suggestion into the editable Details form fields (title / description /
// tags_csv). Nothing is saved here — the creator must still submit the
// existing Details save form.

import { useState } from "react";

type Suggestion = {
  title: string;
  description: string;
  tags: string[];
  source: "ai" | "extractive";
};

export default function MetadataSuggestions({
  courseId,
  currentTitle,
  currentDescription,
  currentTagsCsv,
  initialSuggestion,
  contentChanged,
}: {
  courseId: string;
  currentTitle: string;
  currentDescription: string;
  currentTagsCsv: string;
  /** Last stored suggestion (null when never generated). */
  initialSuggestion: Suggestion | null;
  /** True when course content changed since the stored suggestion was generated. */
  contentChanged: boolean;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(initialSuggestion);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [refreshed, setRefreshed] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setApplied({});
    try {
      const res = await fetch(`/api/courses/${courseId}/suggest-metadata`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      setSuggestion(body.suggestion);
      setRefreshed(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  }

  /** Copy a value into the existing (uncontrolled) Details form field. */
  function applyTo(fieldName: string, value: string) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `form [name="${fieldName}"]`
    );
    if (!el) return;
    el.value = value;
    // Let any listeners (React or otherwise) know the value changed.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    setApplied((p) => ({ ...p, [fieldName]: true }));
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-indigo-900">
            Suggested title &amp; description
          </div>
          <div className="text-xs text-gray-600">
            Analyses this course&apos;s actual training content (modules, text,
            files, videos, quiz questions) and recommends wording rich in
            linkable safety keywords. Nothing is saved until you press Save
            below.
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading
            ? "Analysing content…"
            : suggestion
            ? "Refresh suggestions"
            : "Suggest title & description"}
        </button>
      </div>

      {contentChanged && !refreshed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Course content has changed since the description suggestions were
          written. Refresh the suggestions to reflect the latest content.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="space-y-3">
          <SuggestionRow
            label="Title"
            current={currentTitle || "(empty)"}
            suggested={suggestion.title}
            applied={!!applied["title"]}
            onApply={() => applyTo("title", suggestion.title)}
          />
          <SuggestionRow
            label="Description"
            current={currentDescription || "(empty)"}
            suggested={suggestion.description}
            applied={!!applied["description"]}
            onApply={() => applyTo("description", suggestion.description)}
            multiline
          />
          <SuggestionRow
            label="Tags"
            current={currentTagsCsv || "(empty)"}
            suggested={suggestion.tags.join(", ")}
            applied={!!applied["tags_csv"]}
            onApply={() => applyTo("tags_csv", suggestion.tags.join(", "))}
          />
          <div className="text-xs text-gray-500">
            {suggestion.source === "ai"
              ? "Generated by AI from the course content."
              : "Extracted directly from the course content (no AI provider configured)."}{" "}
            Apply copies the suggestion into the form fields — remember to press
            Save to keep changes.
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  label,
  current,
  suggested,
  onApply,
  applied,
  multiline,
}: {
  label: string;
  current: string;
  suggested: string;
  onApply: () => void;
  applied: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <button
          type="button"
          onClick={onApply}
          className={`rounded-md px-2.5 py-1 text-xs ${
            applied
              ? "border border-green-300 bg-green-50 text-green-700"
              : "border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
          }`}
        >
          {applied ? "✓ Applied to form" : "Apply"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[11px] text-gray-400 mb-0.5">Current</div>
          <div
            className={`text-sm text-gray-600 ${multiline ? "whitespace-pre-wrap" : ""}`}
          >
            {current}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-indigo-400 mb-0.5">Suggested</div>
          <div
            className={`text-sm text-gray-900 ${multiline ? "whitespace-pre-wrap" : ""}`}
          >
            {suggested}
          </div>
        </div>
      </div>
    </div>
  );
}
