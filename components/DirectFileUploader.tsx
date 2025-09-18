'use client';

import { useState } from 'react';
import { useDirectUpload } from '@/lib/hooks/useDirectUpload';
import CameraCaptureUpload from '@/components/CameraCaptureUpload';
import { hasCamera } from '@/lib/utils/device';
import { validateSelectedFile, getFileSizeLimitText, isFileTypeAllowed } from '@/lib/utils/fileValidation';

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
  const [showCameraUpload, setShowCameraUpload] = useState(false);
  const deviceHasCamera = hasCamera();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    const effectiveAccept = accept || (uploadType === 'image' ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.txt');
    
    // Check if file type is allowed
    if (!isFileTypeAllowed(file, effectiveAccept)) {
      const allowedTypes = uploadType === 'image' ? 'images' : 'images, PDFs, and documents';
      onUploadError?.(`File type not allowed. Please select ${allowedTypes}.`);
      return;
    }
    
    // Use centralized validation with consistent limits
    const validation = validateSelectedFile(file);
    
    if (!validation.valid) {
      onUploadError?.(validation.error!);
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
          setShowCameraUpload(false);
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

  // Show camera upload interface if enabled
  if (showCameraUpload) {
    return (
      <div className="space-y-2">
        <CameraCaptureUpload
          onFileSelect={handleFileUpload}
          accept={accept || (uploadType === 'image' ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.txt')}
          className={className}
          showPreview={true}
        />
        <button
          onClick={() => setShowCameraUpload(false)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to regular upload
        </button>
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
        accept={accept || (uploadType === 'image' ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.txt')}
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
            {deviceHasCamera && (
              <>
                {' '}or{' '}
                <button
                  onClick={() => setShowCameraUpload(true)}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  take photo
                </button>
              </>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {getFileSizeLimitText(accept || (uploadType === 'image' ? 'image/*' : 'image/*,application/pdf,.doc,.docx,.txt'))}
          </div>
        </div>
      )}
    </div>
  );
}