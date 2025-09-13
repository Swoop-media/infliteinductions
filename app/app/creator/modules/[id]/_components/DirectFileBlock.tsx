'use client';

import { useState } from 'react';
import DirectFileUploader from '@/components/DirectFileUploader';

interface DirectFileBlockProps {
  moduleId: string;
  blockId: string;
  currentFile?: {
    url?: string;
    display?: string;
    storage_path?: string;
  };
  onFileUpload?: () => void;
}

export default function DirectFileBlock({
  moduleId,
  blockId,
  currentFile,
  onFileUpload
}: DirectFileBlockProps) {
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState(currentFile?.display || '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleUploadComplete = (result: { url?: string; path: string }) => {
    setUploading(false);
    setUploadSuccess(true);
    setUploadError(null);
    onFileUpload?.();
    
    // Refresh the page to show the updated file
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleUploadError = (error: string) => {
    setUploading(false);
    setUploadError(error);
    setUploadSuccess(false);
  };

  const handleClearFile = async () => {
    try {
      const response = await fetch('/api/clear-file-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          blockId,
        }),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        setUploadError('Failed to remove file');
      }
    } catch (error) {
      setUploadError('Failed to remove file');
    }
  };

  return (
    <div className="space-y-4">
      {/* Current file display */}
      {currentFile?.url && (
        <div className="text-sm">
          Current file:{" "}
          <a 
            className="underline break-all text-blue-600 hover:text-blue-500" 
            href={currentFile.url} 
            target="_blank"
            rel="noopener noreferrer"
          >
            {currentFile.display || "Download"}
          </a>
        </div>
      )}

      {!currentFile?.url && (
        <div className="text-sm text-gray-500">No file uploaded.</div>
      )}

      {/* Upload interface */}
      <div className="space-y-4">
        {/* Display name input */}
        <label className="grid gap-1">
          <span className="text-xs text-gray-600">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm w-72"
            placeholder="Shown to learners"
          />
        </label>

        {/* File uploader */}
        <DirectFileUploader
          moduleId={moduleId}
          blockId={blockId}
          uploadType="file"
          maxSizeMB={100}
          displayName={displayName}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*,video/*"
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          className="w-full"
        />

        {/* Status messages */}
        {uploadError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            ⚠️ {uploadError}
          </div>
        )}

        {uploadSuccess && (
          <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-2">
            ✅ File uploaded successfully! Refreshing page...
          </div>
        )}

        {/* Remove file button */}
        {currentFile?.storage_path && (
          <button
            onClick={handleClearFile}
            className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Remove File
          </button>
        )}

        {/* Info */}
        <div className="text-xs text-gray-500 space-y-1">
          <div>• Maximum file size: 100MB</div>
          <div>• ⚠️ PowerPoint files not supported - convert to PDF</div>
          <div>• Supports: PDF, Word, Excel, images, videos, and more</div>
        </div>
      </div>
    </div>
  );
}