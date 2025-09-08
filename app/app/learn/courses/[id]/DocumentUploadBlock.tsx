"use client";

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type DocumentUploadBlockProps = {
  moduleId: string;
  blockId: string;
  label: string;
  requireExpiry: boolean;
  courseId: string;
  currentUserId: string;
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
  existingDocument
}: DocumentUploadBlockProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
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
      const filePath = `learner-documents/${currentUserId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('course-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save document record using the upsert function
      const { data: documentId, error: dbError } = await supabase
        .rpc('upsert_learner_document', {
          p_user_id: currentUserId,
          p_course_id: courseId,
          p_module_id: moduleId,
          p_block_id: blockId,
          p_title: file.name,
          p_file_path: filePath,
          p_file_size: file.size,
          p_file_type: file.type,
          p_expires_on: requireExpiry ? expiryDate : null,
          p_assignment_id: null
        });

      if (dbError) throw dbError;

      setSuccess('Document uploaded successfully!');
      setFile(null);
      setExpiryDate('');

      // Refresh the page to show the uploaded document
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!existingDocument) return;

    setUploading(true);
    try {
      const supabase = supabaseBrowser;

      // Remove from database
      const { error: dbError } = await supabase
        .from('learner_documents')
        .delete()
        .eq('id', existingDocument.id);

      if (dbError) throw dbError;

      setSuccess('Document removed successfully!');
      // Refresh the page
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Remove failed');
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

      {existingDocument ? (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">✅ Document uploaded:</p>
              <p className="text-sm text-gray-600">{existingDocument.title}</p>
              <p className="text-xs text-gray-500">
                Uploaded: {new Date(existingDocument.created_at).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
                {existingDocument.expires_on && (
                  <span> • Expires: {new Date(existingDocument.expires_on).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}</span>
                )}
              </p>
            </div>
            <button
              onClick={handleRemove}
              disabled={uploading}
              className="text-red-600 text-sm hover:text-red-800 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Choose file:</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
              disabled={uploading}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
          </div>

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