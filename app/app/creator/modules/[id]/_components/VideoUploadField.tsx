// @ts-nocheck
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface VideoUploadFieldProps {
  moduleId: string;
  blockId: string;
  currentUrl?: string;
}

// Hard cap: raw/uncompressed uploads (seen up to 1.7GB) load extremely
// slowly for learners and strain storage. Enforced server-side too.
const MAX_SIZE = 300 * 1024 * 1024; // 300MB
const WARN_SIZE = 100 * 1024 * 1024; // soft warning above 100MB

export default function VideoUploadField({ moduleId, blockId, currentUrl }: VideoUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // "optimizing" while a queued/processing compression job exists for this
  // block; "done" briefly after it finishes; null otherwise.
  const [optimizing, setOptimizing] = useState<"optimizing" | "done" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isUploadedVideo = (currentUrl || "").startsWith("/app/files/module-videos/");

  // Poll the compression job status while optimizing. Also runs once on
  // mount for uploaded videos so a page reload mid-compression still shows
  // the indicator.
  useEffect(() => {
    if (!isUploadedVideo && optimizing !== "optimizing") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      try {
        const res = await fetch(`/api/video-compression-status?blockId=${encodeURIComponent(blockId)}`);
        if (!res.ok || cancelled) return;
        const { status } = await res.json();
        if (cancelled) return;
        if (status === "queued" || status === "processing") {
          setOptimizing("optimizing");
          timer = setTimeout(check, 10_000);
        } else if (status === "done") {
          setOptimizing((prev) => {
            // Only show "done" if we were watching an active job — a stale
            // job from a previous session shouldn't surface a banner.
            if (prev === "optimizing") {
              // The URL may have changed (.webm → .mp4); refresh the editor.
              router.refresh();
              return "done";
            }
            return prev;
          });
        } else {
          // skipped / failed / none — clear quietly.
          setOptimizing((prev) => (prev === "optimizing" ? null : prev));
        }
      } catch {
        // Network hiccup — retry only if we already know a job is active.
        if (!cancelled && optimizing === "optimizing") timer = setTimeout(check, 15_000);
      }
    };

    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, isUploadedVideo, optimizing === "optimizing"]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setWarning(null);
      setSuccess(false);

      const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
      if (!["mp4", "m4v", "webm"].includes(ext)) {
        setError("Unsupported video format. Please upload an MP4 (H.264) file — every video editor and phone can export this. WebM is also accepted. Other formats (e.g. MOV, MKV, AVI) often fail to play on learners' devices.");
        return;
      }

      if (file.size > MAX_SIZE) {
        setError(`This video is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is 300MB. Please compress it first: export at 1080p using H.264 (a 5-minute video should be well under 200MB), then upload the compressed file.`);
        return;
      }

      if (file.size > WARN_SIZE) {
        setWarning(`Heads up: this video is ${(file.size / 1024 / 1024).toFixed(0)}MB. Large files load slowly for learners — consider exporting at 1080p / H.264 to shrink it (a 5-minute video should be well under 200MB). Uploading anyway…`);
      }

      setUploading(true);
      setProgress(0);

      try {
        // 1. Get a signed upload URL
        const signedRes = await fetch("/api/upload-signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || "video/mp4",
            moduleId,
            uploadType: "video",
          }),
        });
        if (!signedRes.ok) {
          const data = await signedRes.json().catch(() => ({}));
          throw new Error(data.error || "Could not start the upload");
        }
        const { uploadUrl, path: storagePath } = await signedRes.json();

        // 2. Upload directly to storage with progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 95));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status}). If the file is large, check the Supabase storage upload size limit.`));
          };
          xhr.onerror = () => reject(new Error("Upload failed — network error"));
          xhr.send(file);
        });

        // 3. Save the video URL onto this block
        const completeRes = await fetch("/api/upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId,
            blockId,
            storagePath,
            displayName: file.name,
            uploadType: "video",
          }),
        });
        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => ({}));
          throw new Error(data.error || "Upload finished but saving to the module failed");
        }
        const completeData = await completeRes.json().catch(() => ({}));

        setProgress(100);
        setSuccess(true);
        if (completeData.compressionQueued) setOptimizing("optimizing");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [moduleId, blockId, router]
  );

  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-600">
          <span className="font-medium">Or upload a video file</span> — plays directly in the page, no Microsoft sign-in needed.
          <br />
          MP4 (H.264) recommended — also WebM. Up to 300MB (export at 1080p / H.264 — a 5-minute video should be well under 200MB). MOV/MKV/AVI aren't accepted because they often fail on learners' devices.
          {isUploadedVideo && !uploading && !success && (
            <span className="block text-green-700 mt-1">✓ This block is using an uploaded video. Uploading a new file will replace it.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Choose video file"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,.mp4,.m4v,.webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {uploading && (
        <div className="mt-2">
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">Uploading… {progress}% — keep this page open</p>
        </div>
      )}

      {success && !uploading && (
        <p className="mt-2 text-xs text-green-700">✓ Video uploaded and saved to this block.</p>
      )}
      {optimizing === "optimizing" && !uploading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-700">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden="true" />
          Optimizing video… The current file plays right away; a smaller, faster-loading version will replace it automatically in a few minutes.
        </p>
      )}
      {optimizing === "done" && !uploading && (
        <p className="mt-2 text-xs text-green-700">✓ Video optimized — learners now get the smaller, faster-loading version.</p>
      )}
      {warning && <p className="mt-2 text-xs text-amber-600">{warning}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
