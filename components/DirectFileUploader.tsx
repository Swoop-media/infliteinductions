'use client';

import { useState } from 'react';
import { useDirectUpload } from '@/lib/hooks/useDirectUpload';

interface DirectFileUploaderProps {
  moduleId: string;
  blockId?: string;
  uploadType?: 'file' | 'image';
  accept?: string;
  maxSizeMB?: number;
  displayName?: string;
  onUploadComplete?: (result: { url?: string; path: string }) => void;
  onUploadError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export default function DirectFileUploader({
  moduleId,
  blockId,
  uploadType = 'file',
  accept,
  maxSizeMB = 100,
  displayName,
  onUploadComplete,
  onUploadError,
  className = '',
  children
}: DirectFileUploaderProps) {
  const { uploadFile, uploading, progress } = useDirectUpload();
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Check file size
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      const error = `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${maxSizeMB}MB limit.`;
      onUploadError?.(error);
      return;
    }

    // Block PowerPoint files
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
      const error = 'PowerPoint files are not supported. Please convert to PDF before uploading.';
      onUploadError?.(error);
      return;
    }

    try {
      const result = await uploadFile(file, {
        moduleId,
        blockId,
        uploadType,
        displayName,
        onProgress: (progress) => {
          // Progress is handled by the hook
        },
        onSuccess: (result) => {
          onUploadComplete?.(result);
        },
        onError: (error) => {
          onUploadError?.(error);
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      onUploadError?.(errorMessage);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  if (uploading) {
    return (
      <div className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center ${className}`}>
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Uploading...</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-500">{progress}%</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed ${
        dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
      } rounded-lg p-6 text-center hover:border-gray-400 transition-colors ${className}`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        onChange={handleFileInput}
        accept={accept}
        className="hidden"
        id={`file-upload-${moduleId}-${blockId || 'default'}`}
      />
      
      {children || (
        <div className="space-y-2">
          <div className="text-gray-600">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="text-sm text-gray-600">
            Drag and drop a file here, or{' '}
            <label
              htmlFor={`file-upload-${moduleId}-${blockId || 'default'}`}
              className="text-blue-600 hover:text-blue-500 cursor-pointer font-medium"
            >
              browse
            </label>
          </div>
          <div className="text-xs text-gray-500">
            Maximum file size: {maxSizeMB}MB
          </div>
        </div>
      )}
    </div>
  );
}