// @ts-nocheck
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface VideoUploadFieldProps {
  moduleId: string;
  blockId: string;
  currentUrl?: string;
}

const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export default function VideoUploadField({ moduleId, blockId, currentUrl }: VideoUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isUploadedVideo = (currentUrl || "").startsWith("/app/files/module-videos/");

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setSuccess(false);

      if (file.size > MAX_SIZE) {
        setError(`File is ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB — the limit is 2GB. Try compressing the video to MP4 first.`);
        return;
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

        setProgress(100);
        setSuccess(true);
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
          MP4 recommended (also WebM/MOV), up to 2GB.
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
          accept="video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogv,.ogg"
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
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
