// @ts-nocheck
"use client";

import { useState } from "react";

type Auth = { id: string; title: string };

export default function BulkAssignClient({ authorisations }: { authorisations: Auth[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"preview" | "execute" | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function callApi(mode: "preview" | "execute") {
    setLoading(mode);
    setError(null);
    if (mode === "preview") {
      setPreview(null);
      setResult(null);
      setConfirmText("");
    }
    try {
      const res = await fetch("/api/admin/bulk-assign-authorisation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorisationId: selectedId, mode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const details = Array.isArray(json.errors) && json.errors.length > 0 ? `\n• ${json.errors.join("\n• ")}` : "";
        setError((json.error || json.details || "Something went wrong") + details);
      } else if (mode === "preview") {
        setPreview(json.summary);
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(null);
    }
  }

  const totalAffected = preview ? preview.totalActiveUsers : 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {result && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          <p className="font-medium">{result.message}</p>
          {result.errors?.length > 0 && (
            <div className="mt-2 text-amber-800">
              <p className="font-medium">Some steps reported issues:</p>
              <ul className="list-disc pl-5">
                {result.errors.map((e: string, i: number) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-white p-4 space-y-3">
        <label className="block text-sm font-medium">1. Choose the authorisation</label>
        <select
          className="w-full max-w-lg rounded-md border px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setPreview(null);
            setResult(null);
            setError(null);
            setConfirmText("");
          }}
        >
          <option value="">— Select an authorisation —</option>
          {authorisations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          disabled={!selectedId || loading !== null}
          onClick={() => callApi("preview")}
        >
          {loading === "preview" ? "Loading preview…" : "Preview impact"}
        </button>
      </div>

      {preview && !result && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h2 className="text-lg font-semibold">2. Review what will happen</h2>
          <div className="grid grid-cols-2 gap-3 max-w-lg sm:grid-cols-4">
            <Stat label="Active users" value={preview.totalActiveUsers} />
            <Stat label="New assignments" value={preview.newAssignments} />
            <Stat label="Completed → reset" value={preview.completedResets} />
            <Stat label="In progress → reset" value={preview.inProgressResets} />
          </div>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            <li>
              <strong>{preview.newAssignments}</strong> users will get "{preview.authorisation.title}" for the first
              time ({preview.linkedCourses} linked course{preview.linkedCourses === 1 ? "" : "s"} assigned).
            </li>
            <li>
              <strong>{preview.completedResets}</strong> users who completed it will be reset for a forced retake —
              their previous completion and expiry date are saved to training history first.
            </li>
            <li>
              <strong>{preview.inProgressResets}</strong> users part-way through will also be reset to start fresh.
            </li>
            <li>Every user gets an in-app notification and a Teams message (sent in the background).</li>
            <li>Archived users are skipped.</li>
          </ul>

          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-900">
              This resets progress for {preview.completedResets + preview.inProgressResets} users and cannot be undone
              from this page. Type <code className="rounded bg-amber-100 px-1">ASSIGN</code> to confirm.
            </p>
            <div className="flex items-center gap-2">
              <input
                className="rounded-md border px-3 py-1.5 text-sm"
                placeholder="Type ASSIGN"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
              <button
                className="rounded-md bg-black px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                disabled={confirmText !== "ASSIGN" || loading !== null || totalAffected === 0}
                onClick={() => callApi("execute")}
              >
                {loading === "execute" ? "Running… this may take a minute" : `Assign to all ${totalAffected} users`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-gray-50 p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}
