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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(false);
    if (!displayName) {
      setDisplayName(file.name);
    }
  };

  const handleSaveReplace = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get signed URL for upload
      const signedUrlResponse = await fetch('/api/upload-signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          contentType: selectedFile.type,
          moduleId,
          uploadType: 'file',
        }),
      });

      if (!signedUrlResponse.ok) {
        const errorData = await signedUrlResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, path: storagePath, token } = await signedUrlResponse.json();

      // Step 2: Upload file directly to Supabase storage
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Complete the upload (update database)
      const completeResponse = await fetch('/api/upload-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          blockId,
          storagePath,
          displayName: displayName || selectedFile.name,
          uploadType: 'file',
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to complete upload');
      }

      setUploadSuccess(true);
      setSelectedFile(null);
      onFileUpload?.();
      
      // Refresh the page to show the updated file
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
    } finally {
      setUploading(false);
    }
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

        {/* File selector */}
        <div className="space-y-2">
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Choose file</span>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // Check file size (max 20MB)
                  if (file.size > 20 * 1024 * 1024) {
                    setUploadError('File size exceeds 20MB limit. Please use an online compressor for larger files.');
                    return;
                  }
                  
                  // Block PowerPoint files
                  const fileName = file.name.toLowerCase();
                  if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
                    setUploadError('PowerPoint files are not supported. Please convert to PDF before uploading.');
                    return;
                  }
                  
                  handleFileSelect(file);
                }
              }}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*,video/*"
              className="text-sm"
            />
          </label>
          
          {selectedFile && (
            <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-2">
              📄 Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
            </div>
          )}
          
          {/* Save/Replace Button */}
          {selectedFile && (
            <button
              onClick={handleSaveReplace}
              disabled={uploading || !displayName.trim()}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                uploading || !displayName.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {uploading ? (
                <>
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                  Uploading...
                </>
              ) : currentFile?.storage_path ? (
                'Replace File'
              ) : (
                'Save File'
              )}
            </button>
          )}
        </div>

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
          <div>• Maximum file size: 20MB - use an online compressor for larger files</div>
          <div>• ⚠️ PowerPoint files not supported - convert to PDF</div>
          <div>• Supports: PDF, Word, Excel, images, videos, and more</div>
        </div>
      </div>
    </div>
  );
}