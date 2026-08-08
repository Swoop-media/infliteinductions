// @ts-nocheck
"use client";

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import CameraCaptureUpload from '@/components/CameraCaptureUpload';
import MultiPhotoCaptureUpload from '@/components/MultiPhotoCaptureUpload';
import { hasCamera } from '@/lib/utils/device';
import { Camera, Images } from 'lucide-react';
import { validateSelectedFile, getFileSizeLimitText } from '@/lib/utils/fileValidation';
import { formatDateConsistent } from '@/lib/utils';

type DocumentUploadBlockProps = {
  moduleId: string;
  blockId: string;
  label: string;
  requireExpiry: boolean;
  courseId: string;
  currentUserId: string;
  assignmentId: string;
  existingDocument?: {
    id: string;
    title: string;
    expires_on: string | null;
    created_at: string;
  } | null;
};

export default function DocumentUploadBlock({
  moduleId,
  blockId,
  label,
  requireExpiry,
  courseId,
  currentUserId,
  assignmentId,
  existingDocument
}: DocumentUploadBlockProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCameraUpload, setShowCameraUpload] = useState(false);
  const [showMultiPhotoUpload, setShowMultiPhotoUpload] = useState(false);
  const [deviceHasCamera, setDeviceHasCamera] = useState(false);
  const [replacing, setReplacing] = useState(false);

  // Check for camera only on client side after mount
  useEffect(() => {
    setDeviceHasCamera(hasCamera());
  }, []);

  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    setShowCameraUpload(false);
    setShowMultiPhotoUpload(false);
    setError(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    // Use centralized validation
    const validation = validateSelectedFile(file);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    if (requireExpiry && !expiryDate) {
      setError('Please set an expiry date');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = supabaseBrowser;

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${currentUserId}/${fileName}`;

      console.log('Uploading file:', { 
        fileName, 
        filePath, 
        fileSize: file.size,
        fileType: file.type,
        currentUserId,
        assignmentId,
        bucket: 'learner-documents'
      });

      const { error: uploadError } = await supabase.storage
        .from('learner-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // Save document record - bypass RPC and use direct table operations
      const expiresOn = requireExpiry && expiryDate 
        ? new Date(expiryDate + 'T00:00:00').toISOString()
        : null;
      
      // Get course and module titles for the record
      const [courseData, moduleData] = await Promise.all([
        supabase.from('courses').select('title').eq('id', courseId).single(),
        supabase.from('course_modules').select('title').eq('id', moduleId).single()
      ]);
      
      const courseTitle = courseData.data?.title || '';
      const moduleTitle = moduleData.data?.title || '';
      
      console.log('Saving document:', {
        user_id: currentUserId,
        title: file.name,
        course_title: courseTitle,
        module_title: moduleTitle
      });
      
      // Retention-first replace: mark any existing active document for this
      // user/module/block as "replaced" (record and storage file are kept),
      // then insert the new document as the active one.
      //
      // Two separate updates are used because PostgREST .or() filters in
      // UPDATE context can silently skip rows. Pass 1 catches pre-migration
      // rows whose status column is NULL; Pass 2 catches rows with a
      // non-'replaced' status value.
      const updateBase = supabase
        .from('learner_documents')
        .update({ status: 'replaced', updated_at: new Date().toISOString() })
        .eq('user_id', currentUserId)
        .eq('module_id', moduleId)
        .eq('block_id', blockId);

      const { error: replaceError1 } = await updateBase.is('status', null);
      if (replaceError1) {
        console.error('Error marking previous (null-status) document as replaced:', replaceError1);
        throw replaceError1;
      }
      const { error: replaceError2 } = await supabase
        .from('learner_documents')
        .update({ status: 'replaced', updated_at: new Date().toISOString() })
        .eq('user_id', currentUserId)
        .eq('module_id', moduleId)
        .eq('block_id', blockId)
        .neq('status', 'replaced');
      if (replaceError2) {
        console.error('Error marking previous document as replaced:', replaceError2);
        throw replaceError2;
      }

      // Insert new document as the active one
      const { data: result, error: dbError } = await supabase
        .from('learner_documents')
        .insert({
          user_id: currentUserId,
          course_id: courseId,
          module_id: moduleId,
          block_id: blockId,
          title: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          expires_on: expiresOn,
          assignment_id: assignmentId || null,
          course_title: courseTitle,
          module_title: moduleTitle,
          status: 'active',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }
      
      console.log('Document saved successfully:', result);

      setSuccess('Document uploaded successfully!');
      setFile(null);
      setExpiryDate('');
      setShowCameraUpload(false);

      // Refresh the page to show the uploaded document
      window.location.reload();
    } catch (err: any) {
      console.error('Upload error:', err);
      // Show user-friendly error message instead of technical details
      if (err.message?.includes('upsert_learner_document')) {
        setError('There was a problem uploading your document. Please try again or contact support if the issue persists.');
      } else {
        setError(err.message || 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-yellow-50">
      <div className="mb-3">
        <h3 className="font-medium text-lg mb-2">📤 Document Upload Required</h3>
        <p className="text-sm text-gray-700 mb-4">{label}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          {success}
        </div>
      )}

      {existingDocument && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">✅ Document uploaded:</p>
              <p className="text-sm text-gray-600">{existingDocument.title}</p>
              <p className="text-xs text-gray-500">
                Uploaded: {formatDateConsistent(existingDocument.created_at)}
                {existingDocument.expires_on && (
                  <span> • Expires: {formatDateConsistent(existingDocument.expires_on)}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => {
                setReplacing((v) => !v);
                setError(null);
                setSuccess(null);
              }}
              disabled={uploading}
              className="text-blue-600 text-sm hover:text-blue-800 disabled:opacity-50"
            >
              {replacing ? 'Cancel' : 'Replace'}
            </button>
          </div>
          {replacing && (
            <p className="mt-2 text-xs text-gray-500">
              Upload a new file below. Your current document will be kept in your
              records under “Old documents”.
            </p>
          )}
        </div>
      )}

      {(!existingDocument || replacing) && (
        <form onSubmit={handleUpload} className="space-y-4">
          {showMultiPhotoUpload ? (
            <div className="space-y-2">
              <MultiPhotoCaptureUpload
                onFileSelect={handleFileSelection}
                maxPhotos={10}
                label="Capture Multiple Photos"
                suggestedName=""
              />
              <button
                type="button"
                onClick={() => setShowMultiPhotoUpload(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to file selection
              </button>
            </div>
          ) : showCameraUpload ? (
            <div className="space-y-2">
              <CameraCaptureUpload
                onFileSelect={handleFileSelection}
                accept="image/*"
                showPreview={true}
                className=""
              />
              <button
                type="button"
                onClick={() => setShowCameraUpload(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to file selection
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Choose file:</label>
              <div className="space-y-2">
                {deviceHasCamera && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCameraUpload(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Camera size={16} />
                      Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMultiPhotoUpload(true)}
                      className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 flex items-center justify-center gap-2"
                    >
                      <Images size={16} />
                      Multiple Photos
                    </button>
                  </div>
                )}
                <div className="relative">
                  <input
                    type="file"
                    onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                    disabled={uploading}
                    accept="image/*,.pdf,.doc,.docx,.txt"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {getFileSizeLimitText('image/*,.pdf,.doc,.docx,.txt')}
                </p>
              </div>
              {file && (
                <p className="mt-2 text-xs text-gray-600">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
                </p>
              )}
            </div>
          )}

          {requireExpiry && (
            <div>
              <label className="block text-sm font-medium mb-2">Expiry date:</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
                disabled={uploading}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !file}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </form>
      )}
    </div>
  );
}