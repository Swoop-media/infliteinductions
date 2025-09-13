// Hook for direct file upload to Supabase storage using signed URLs
// This bypasses Cloud Run's 32MB limit by uploading directly to storage
import { useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

interface UploadOptions {
  moduleId: string;
  blockId?: string;
  uploadType?: 'file' | 'image';
  displayName?: string;
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
      displayName,
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

      const { uploadUrl, path: storagePath, token } = await signedUrlResponse.json();

      // Step 2: Upload file directly to Supabase storage using the token
      // Create a temporary Supabase client for the upload
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { error: uploadError } = await supabase.storage
        .from('course-files')
        .uploadToSignedUrl(storagePath, token, file);

      if (uploadError) {
        throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
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
          displayName: displayName || file.name,
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