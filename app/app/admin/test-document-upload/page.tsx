// @ts-nocheck
'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

export default function TestDocumentUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser;
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      // Load all documents
      const { data, error } = await supabase
        .from('learner_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setMessage({ type: 'error', text: `Error loading documents: ${error.message}` });
      } else {
        setDocuments(data || []);
        setMessage({ type: 'info', text: `Found ${data?.length || 0} documents in database` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleTestUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;
    
    if (!file || file.size === 0) {
      setMessage({ type: 'error', text: 'Please select a file' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const supabase = supabaseBrowser;
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      // Create test file path
      const fileExt = file.name.split('.').pop();
      const fileName = `test-${Date.now()}.${fileExt}`;
      const filePath = `test-documents/${user.id}/${fileName}`;

      // Upload to storage
      setMessage({ type: 'info', text: 'Uploading to storage...' });
      const { error: uploadError } = await supabase.storage
        .from('course-files')
        .upload(filePath, file);

      if (uploadError) {
        setMessage({ type: 'error', text: `Storage upload failed: ${uploadError.message}` });
        return;
      }

      // Save to database
      setMessage({ type: 'info', text: 'Saving to database...' });
      const { data: savedDoc, error: dbError } = await supabase
        .from('learner_documents')
        .insert({
          user_id: user.id,
          title: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          expires_on: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          course_title: 'Test Course',
          module_title: 'Test Module',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        setMessage({ type: 'error', text: `Database save failed: ${dbError.message}` });
        // Try to clean up the uploaded file
        await supabase.storage.from('course-files').remove([filePath]);
      } else {
        setMessage({ type: 'success', text: `Document uploaded successfully! ID: ${savedDoc.id}` });
        // Reload documents
        await loadDocuments();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Unexpected error: ${error.message}` });
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (doc: any) => {
    if (!confirm('Delete this document?')) return;

    try {
      const supabase = supabaseBrowser;
      
      // Delete from database
      const { error: dbError } = await supabase
        .from('learner_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) {
        setMessage({ type: 'error', text: `Delete failed: ${dbError.message}` });
      } else {
        // Try to delete from storage (ignore errors)
        await supabase.storage.from('course-files').remove([doc.file_path]);
        
        setMessage({ type: 'success', text: 'Document deleted' });
        await loadDocuments();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test Document Upload</h1>
        <Link href="/app/admin?tab=documents" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          ← Back to Admin
        </Link>
      </div>

      {message && (
        <div className={`p-4 rounded-md border ${
          message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          message.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Debug Information</h3>
        <p className="text-sm text-yellow-800">
          This page tests document upload functionality. It uploads files to Supabase storage
          and saves records to the learner_documents table.
        </p>
      </div>

      <form onSubmit={handleTestUpload} className="space-y-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">Upload Test Document</h2>
        
        <div>
          <label className="block text-sm font-medium mb-2">Select File</label>
          <input
            type="file"
            name="file"
            accept="image/*,application/pdf,.doc,.docx"
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={uploading}
          />
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents in Database</h2>
          <button
            onClick={loadDocuments}
            disabled={loading}
            className="px-3 py-1 rounded-md border hover:bg-gray-50 disabled:bg-gray-100"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="border rounded-md p-4 text-gray-600">
            No documents found. Click "Refresh" to load documents.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">User ID</th>
                  <th className="px-3 py-2 text-left">File Path</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{doc.title}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{doc.user_id?.slice(0, 8)}...</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{doc.file_path}</td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteDocument(doc)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}