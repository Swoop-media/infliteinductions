// Hook for direct file upload to Supabase storage using signed URLs
// This bypasses Cloud Run's 32MB limit by uploading directly to storage
import { useState, useCallback } from 'react';

interface UploadOptions {
  moduleId: string;
  blockId?: string;
  uploadType?: 'file' | 'image';
  onProgress?: (progress: number) => void;
  onSuccess?: (result: { url?: string; path: string }) => void;
  onError?: (error: string) => void;
}

interface UploadResult {
  url?: string;
  path: string;
}

export function useDirectUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(async (
    file: File,
    options: UploadOptions
  ): Promise<UploadResult | null> => {
    const {
      moduleId,
      blockId,
      uploadType = 'file',
      onProgress,
      onSuccess,
      onError
    } = options;

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Get signed URL for upload
      const signedUrlResponse = await fetch('/api/upload-signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          moduleId,
          uploadType,
        }),
      });

      if (!signedUrlResponse.ok) {
        const errorData = await signedUrlResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, path: storagePath } = await signedUrlResponse.json();

      // Step 2: Upload file directly to Supabase storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      onProgress?.(50);
      setProgress(50);

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
          displayName: file.name,
          uploadType,
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to complete upload');
      }

      const result = await completeResponse.json();
      
      onProgress?.(100);
      setProgress(100);
      
      const uploadResult = {
        path: storagePath,
        url: result.url,
      };

      onSuccess?.(uploadResult);
      return uploadResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      onError?.(errorMessage);
      console.error('Direct upload error:', error);
      return null;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, []);

  return {
    uploadFile,
    uploading,
    progress,
  };
}