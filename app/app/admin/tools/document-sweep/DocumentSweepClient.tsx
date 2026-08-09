// @ts-nocheck
"use client";

import { useState } from "react";

function formatAge(createdAt: string | null) {
  if (!createdAt) return "unknown age";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "unknown age";
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  if (days < 1) return `uploaded ${dateStr} (today)`;
  return `uploaded ${dateStr} (${days} day${days === 1 ? "" : "s"} ago)`;
}

export default function DocumentSweepClient() {
  const [safetyWindowHours, setSafetyWindowHours] = useState(24);
  const [scan, setScan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"scan" | "delete" | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showAllPaths, setShowAllPaths] = useState(false);

  function resetReviewState() {
    setScan(null);
    setResult(null);
    setShowDeleteWarning(false);
    setConfirmText("");
    setShowAllPaths(false);
  }

  async function callApi(mode: "scan" | "delete") {
    setLoading(mode);
    setError(null);
    if (mode === "scan") resetReviewState();
    try {
      const res = await fetch("/api/admin/document-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "scan"
            ? { dryRun: true, safetyWindowHours }
            : {
                // Delete ONLY the exact files reviewed in the scan — the
                // server revalidates each one and never adds new candidates.
                paths: scan.wouldDelete,
                // Use the exact window the admin reviewed in the scan,
                // never the current (possibly edited) input value.
                safetyWindowHours: scan.safetyWindowHours,
              }
        ),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Something went wrong");
      } else if (mode === "scan") {
        setScan(json);
      } else {
        setResult(json);
        setShowDeleteWarning(false);
        setConfirmText("");
      }
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(null);
    }
  }

  const wouldDelete: string[] = scan?.wouldDelete ?? [];
  const details: { path: string; createdAt: string | null }[] =
    scan?.wouldDeleteDetails ??
    wouldDelete.map((p) => ({ path: p, createdAt: null }));
  const shownDetails = showAllPaths ? details : details.slice(0, 50);

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
            Deletion complete: {result.deletedCount} of {result.requested} reviewed file
            {result.requested === 1 ? "" : "s"} deleted.
          </p>
          {result.skipped?.length > 0 && (
            <div className="text-amber-800">
              <p className="font-medium">
                {result.skipped.length} file{result.skipped.length === 1 ? " was" : "s were"} skipped
                (not deleted):
              </p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-5">
                {result.skipped.map((s: any) => (
                  <li key={s.path}>
                    <span className="font-mono text-xs">{s.path}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
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
            className="w-24 rounded-md border px-3 py-1.5 text-sm disabled:bg-gray-100"
            disabled={loading !== null}
            value={safetyWindowHours}
            onChange={(e) => {
              setSafetyWindowHours(Number(e.target.value));
              // Changing the window invalidates any previous scan — the
              // admin must re-scan and review a fresh preview.
              resetReviewState();
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
        <p className="text-xs text-gray-500">
          Scanning never deletes anything — it only builds a list for you to review below.
        </p>
      </div>

      {scan && !result && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h2 className="text-lg font-semibold">2. Review the findings</h2>
          <div className="grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Files scanned" value={scan.scanned} />
            <Stat label={`Older than ${scan.safetyWindowHours}h`} value={scan.candidatesOlderThanWindow} />
            <Stat label="Recommended for deletion" value={scan.unreferenced} />
          </div>

          {scan.refCheckErrors > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {scan.refCheckErrors} reference check{scan.refCheckErrors === 1 ? "" : "s"} failed during the scan.
              Those batches were skipped for safety and are not included in the list below.
            </div>
          )}

          {details.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 space-y-1">
                <p className="font-medium">Why these files are recommended for deletion</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>
                    No learner document record in the system points to them — in any status (active,
                    replaced or archived). They are not visible to anyone anywhere in the app.
                  </li>
                  <li>
                    They are older than the {scan.safetyWindowHours}-hour safety window, so they are not
                    uploads that are still in progress.
                  </li>
                  <li>
                    This usually happens when a learner closed the tab mid-upload: the file reached storage
                    but the document record was never saved.
                  </li>
                </ul>
                <p>
                  <span className="font-medium">Before deleting, check anything that looks like a real document</span>{" "}
                  (e.g. a licence or certificate filename). If in doubt, leave it — stranded files cost
                  nothing to keep and will show up again in the next scan.
                </p>
              </div>

              <p className="text-sm font-medium">Files recommended for deletion:</p>
              <ul className="max-h-64 overflow-y-auto rounded-md border bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
                {shownDetails.map((d) => (
                  <li key={d.path} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono">{d.path}</span>
                    <span className="text-gray-500">— {formatAge(d.createdAt)}, no document record found</span>
                  </li>
                ))}
              </ul>
              {details.length > shownDetails.length && (
                <button
                  className="text-sm text-blue-700 hover:underline"
                  onClick={() => setShowAllPaths(true)}
                >
                  Show all {details.length} files
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-700">No stranded files found — nothing to review.</p>
          )}

          {details.length > 0 && !showDeleteWarning && (
            <button
              className="rounded-md border border-red-300 bg-white px-4 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={loading !== null}
              onClick={() => setShowDeleteWarning(true)}
            >
              Delete {details.length} stranded file{details.length === 1 ? "" : "s"}…
            </button>
          )}

          {details.length > 0 && showDeleteWarning && (
            <div className="space-y-3 rounded-md border-2 border-red-400 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">
                ⚠️ Warning: this deletion is permanent
              </p>
              <p className="text-sm text-red-900">
                This will permanently delete {details.length} file{details.length === 1 ? "" : "s"} from
                storage. <span className="font-medium">There is no undo, no recycle bin, and no way to
                recover these files afterwards.</span> If any of them turn out to be real documents, the
                person will have to upload them again.
              </p>
              <p className="text-sm text-red-900">
                References are re-checked at deletion time with the same safety window, so anything that
                gained a document record since the scan will be spared. Type{" "}
                <code className="rounded bg-red-100 px-1">DELETE</code> to confirm.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="rounded-md border px-3 py-1.5 text-sm"
                  placeholder="Type DELETE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <button
                  className="rounded-md bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={confirmText !== "DELETE" || loading !== null}
                  onClick={() => callApi("delete")}
                >
                  {loading === "delete" ? "Deleting… this may take a minute" : `Permanently delete ${details.length} file${details.length === 1 ? "" : "s"}`}
                </button>
                <button
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-white"
                  disabled={loading !== null}
                  onClick={() => {
                    setShowDeleteWarning(false);
                    setConfirmText("");
                  }}
                >
                  Cancel
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
