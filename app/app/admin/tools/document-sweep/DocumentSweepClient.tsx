// @ts-nocheck
"use client";

import { useState } from "react";

export default function DocumentSweepClient() {
  const [safetyWindowHours, setSafetyWindowHours] = useState(24);
  const [scan, setScan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"scan" | "delete" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showAllPaths, setShowAllPaths] = useState(false);

  async function callApi(mode: "scan" | "delete") {
    setLoading(mode);
    setError(null);
    if (mode === "scan") {
      setScan(null);
      setResult(null);
      setConfirmText("");
      setShowAllPaths(false);
    }
    try {
      const res = await fetch("/api/admin/document-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: mode === "scan",
          // The delete must use the exact window the admin reviewed in the
          // scan, never the current (possibly edited) input value.
          safetyWindowHours: mode === "delete" ? scan.safetyWindowHours : safetyWindowHours,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Something went wrong");
      } else if (mode === "scan") {
        setScan(json);
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(null);
    }
  }

  const wouldDelete: string[] = scan?.wouldDelete ?? [];
  const shownPaths = showAllPaths ? wouldDelete : wouldDelete.slice(0, 50);

  return (
    <div className="space-y-4">
      {error && (
        <div className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 space-y-2">
          <p className="font-medium">
            Sweep complete: {result.deletedCount} file{result.deletedCount === 1 ? "" : "s"} deleted
            (scanned {result.scanned}, {result.unreferenced} stranded).
          </p>
          {result.refCheckErrors > 0 && (
            <p className="text-amber-800">
              {result.refCheckErrors} reference check{result.refCheckErrors === 1 ? "" : "s"} failed — those
              batches were skipped (nothing in them was deleted). Run another scan to retry.
            </p>
          )}
          {result.deleteErrors?.length > 0 && (
            <div className="text-amber-800">
              <p className="font-medium">Some delete batches failed:</p>
              <ul className="list-disc pl-5">
                {result.deleteErrors.map((e: string, i: number) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-white p-4 space-y-3">
        <label className="block text-sm font-medium">1. Scan for stranded files</label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-700">Only consider files older than</span>
          <input
            type="number"
            min={24}
            className="w-24 rounded-md border px-3 py-1.5 text-sm"
            value={safetyWindowHours}
            onChange={(e) => {
              setSafetyWindowHours(Number(e.target.value));
              // Changing the window invalidates any previous scan — the
              // admin must re-scan and review a fresh preview.
              setScan(null);
              setResult(null);
              setConfirmText("");
              setShowAllPaths(false);
            }}
          />
          <span className="text-gray-700">hours (minimum 24, so in-progress uploads are never touched)</span>
        </div>
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          disabled={loading !== null}
          onClick={() => callApi("scan")}
        >
          {loading === "scan" ? "Scanning… this may take a minute" : "Scan for stranded files"}
        </button>
      </div>

      {scan && !result && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h2 className="text-lg font-semibold">2. Review the scan result</h2>
          <div className="grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Files scanned" value={scan.scanned} />
            <Stat label={`Older than ${scan.safetyWindowHours}h`} value={scan.candidatesOlderThanWindow} />
            <Stat label="Stranded (would delete)" value={scan.unreferenced} />
          </div>

          {scan.refCheckErrors > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {scan.refCheckErrors} reference check{scan.refCheckErrors === 1 ? "" : "s"} failed during the scan.
              Those batches were skipped for safety and are not included in the list below.
            </div>
          )}

          {wouldDelete.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Files that will be deleted:</p>
              <ul className="max-h-64 overflow-y-auto rounded-md border bg-gray-50 p-3 font-mono text-xs text-gray-700 space-y-0.5">
                {shownPaths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {wouldDelete.length > shownPaths.length && (
                <button
                  className="text-sm text-blue-700 hover:underline"
                  onClick={() => setShowAllPaths(true)}
                >
                  Show all {wouldDelete.length} files
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-700">No stranded files found — nothing to delete.</p>
          )}

          {wouldDelete.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                This permanently deletes {wouldDelete.length} file{wouldDelete.length === 1 ? "" : "s"} from
                storage and cannot be undone. Type <code className="rounded bg-amber-100 px-1">DELETE</code> to
                confirm. (The sweep re-checks references at deletion time, using the same safety window.)
              </p>
              <div className="flex items-center gap-2">
                <input
                  className="rounded-md border px-3 py-1.5 text-sm"
                  placeholder="Type DELETE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <button
                  className="rounded-md bg-black px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                  disabled={confirmText !== "DELETE" || loading !== null}
                  onClick={() => callApi("delete")}
                >
                  {loading === "delete" ? "Deleting… this may take a minute" : `Delete ${wouldDelete.length} stranded files`}
                </button>
              </div>
            </div>
          )}
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
