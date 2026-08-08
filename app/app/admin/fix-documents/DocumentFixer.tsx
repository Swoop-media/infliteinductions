// @ts-nocheck
'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface DocumentFixerProps {
  documents: any[];
  courses: any[];
  modules: any[];
}

export default function DocumentFixer({ documents, courses, modules }: DocumentFixerProps) {
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({});
  const [editedData, setEditedData] = useState<{ [key: string]: any }>({});
  const router = useRouter();

  // Find documents with missing fields
  const documentsWithIssues = documents.filter(d => 
    !d.course_title || !d.module_title || !d.course_id || !d.module_id
  );

  const toggleSelectAll = () => {
    if (selectedDocs.size === documentsWithIssues.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(documentsWithIssues.map(d => d.id)));
    }
  };

  const toggleSelect = (docId: string) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  const startEdit = (doc: any) => {
    setEditMode({ ...editMode, [doc.id]: true });
    setEditedData({ 
      ...editedData, 
      [doc.id]: {
        course_id: doc.course_id || '',
        module_id: doc.module_id || '',
        course_title: doc.course_title || '',
        module_title: doc.module_title || '',
        title: doc.title || ''
      }
    });
  };

  const cancelEdit = (docId: string) => {
    setEditMode({ ...editMode, [docId]: false });
    delete editedData[docId];
  };

  const saveEdit = async (doc: any) => {
    const data = editedData[doc.id];
    if (!data) return;

    setProcessing(true);
    try {
      const supabase = supabaseBrowser;
      
      // If course_id is selected but not course_title, get it from courses
      let course_title = data.course_title;
      if (data.course_id && !course_title) {
        const course = courses.find(c => c.id === data.course_id);
        course_title = course?.title || '';
      }

      // If module_id is selected but not module_title, get it from modules
      let module_title = data.module_title;
      if (data.module_id && !module_title) {
        const module = modules.find(m => m.id === data.module_id);
        module_title = module?.title || '';
      }

      const { error } = await supabase
        .from('learner_documents')
        .update({
          course_id: data.course_id || null,
          module_id: data.module_id || null,
          course_title: course_title || null,
          module_title: module_title || null,
          title: data.title || doc.title
        })
        .eq('id', doc.id);

      if (error) {
        setMessage({ type: 'error', text: `Failed to update: ${error.message}` });
      } else {
        setMessage({ type: 'success', text: 'Document updated successfully' });
        setEditMode({ ...editMode, [doc.id]: false });
        router.refresh();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setProcessing(false);
    }
  };

  const autoFixSelected = async () => {
    if (selectedDocs.size === 0) {
      setMessage({ type: 'error', text: 'Please select documents to fix' });
      return;
    }

    setProcessing(true);
    setMessage({ type: 'info', text: `Processing ${selectedDocs.size} documents...` });

    try {
      const supabase = supabaseBrowser;
      let fixed = 0;
      let errors = 0;

      for (const docId of Array.from(selectedDocs)) {
        const doc = documents.find(d => d.id === docId);
        if (!doc) continue;

        // Try to auto-fix based on course_id and module_id
        let updates: any = {};
        
        if (doc.course_id && !doc.course_title) {
          const course = courses.find(c => c.id === doc.course_id);
          if (course) updates.course_title = course.title;
        }

        if (doc.module_id && !doc.module_title) {
          const module = modules.find(m => m.id === doc.module_id);
          if (module) {
            updates.module_title = module.title;
            // Also set course_id if missing but module has it
            if (!doc.course_id && module.course_id) {
              updates.course_id = module.course_id;
              const course = courses.find(c => c.id === module.course_id);
              if (course) updates.course_title = course.title;
            }
          }
        }

        // Only update if we have something to fix
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('learner_documents')
            .update(updates)
            .eq('id', docId);

          if (error) {
            errors++;
            console.error(`Failed to fix document ${docId}:`, error);
          } else {
            fixed++;
          }
        }
      }

      setMessage({ 
        type: fixed > 0 ? 'success' : 'info', 
        text: `Fixed ${fixed} documents${errors > 0 ? `, ${errors} errors` : ''}` 
      });
      
      setSelectedDocs(new Set());
      router.refresh();
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setProcessing(false);
    }
  };

  // Learner documents must be retained for compliance: never hard-delete
  // rows or storage files. Archiving marks the row status = 'replaced' so it
  // disappears from active listings, but the record and file are kept.
  const archiveDocument = async (doc: any) => {
    if (doc.status === 'replaced') {
      setMessage({ type: 'info', text: 'This document is already archived.' });
      return;
    }
    if (!confirm(`Archive document "${doc.title}"? The record and file are retained for compliance, but it will no longer appear as an active document.`)) return;

    try {
      const supabase = supabaseBrowser;

      const { error } = await supabase
        .from('learner_documents')
        .update({ status: 'replaced' })
        .eq('id', doc.id);

      if (error) {
        setMessage({ type: 'error', text: `Archive failed: ${error.message}` });
      } else {
        setMessage({ type: 'success', text: 'Document archived (record and file retained)' });
        router.refresh();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-md border ${
          message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          message.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}

      {documentsWithIssues.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1 rounded-md border hover:bg-gray-50 text-sm"
            >
              {selectedDocs.size === documentsWithIssues.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={autoFixSelected}
              disabled={processing || selectedDocs.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              Auto-Fix Selected ({selectedDocs.size})
            </button>
          </div>
          <div className="text-sm text-gray-600">
            {documentsWithIssues.length} documents need attention
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Select</th>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">File Path</th>
              <th className="px-3 py-2 text-left">Course</th>
              <th className="px-3 py-2 text-left">Module</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y bg-white">
            {documents.map((doc) => {
              const hasIssues = !doc.course_title || !doc.module_title || !doc.course_id || !doc.module_id;
              const isEditing = editMode[doc.id];
              const data = editedData[doc.id];
              
              return (
                <tr key={doc.id} className={hasIssues ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2">
                    {hasIssues && (
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="rounded"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={data?.title || ''}
                        onChange={(e) => setEditedData({
                          ...editedData,
                          [doc.id]: { ...data, title: e.target.value }
                        })}
                        className="px-2 py-1 border rounded text-xs w-full"
                      />
                    ) : (
                      <div className="font-medium">{doc.title}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {doc.profiles?.full_name || doc.profiles?.email || 'Unknown'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">
                    {doc.file_path}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="space-y-1">
                        <select
                          value={data?.course_id || ''}
                          onChange={(e) => setEditedData({
                            ...editedData,
                            [doc.id]: { ...data, course_id: e.target.value }
                          })}
                          className="px-2 py-1 border rounded text-xs w-full"
                        >
                          <option value="">Select Course</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Course Title"
                          value={data?.course_title || ''}
                          onChange={(e) => setEditedData({
                            ...editedData,
                            [doc.id]: { ...data, course_title: e.target.value }
                          })}
                          className="px-2 py-1 border rounded text-xs w-full"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className={doc.course_title ? '' : 'text-red-600'}>
                          {doc.course_title || '❌ Missing'}
                        </div>
                        {doc.course_id && (
                          <div className="text-xs text-gray-500">{doc.course_id.slice(0, 8)}...</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="space-y-1">
                        <select
                          value={data?.module_id || ''}
                          onChange={(e) => setEditedData({
                            ...editedData,
                            [doc.id]: { ...data, module_id: e.target.value }
                          })}
                          className="px-2 py-1 border rounded text-xs w-full"
                        >
                          <option value="">Select Module</option>
                          {modules
                            .filter(m => !data?.course_id || m.course_id === data.course_id)
                            .map(m => (
                              <option key={m.id} value={m.id}>{m.title}</option>
                            ))
                          }
                        </select>
                        <input
                          type="text"
                          placeholder="Module Title"
                          value={data?.module_title || ''}
                          onChange={(e) => setEditedData({
                            ...editedData,
                            [doc.id]: { ...data, module_title: e.target.value }
                          })}
                          className="px-2 py-1 border rounded text-xs w-full"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className={doc.module_title ? '' : 'text-red-600'}>
                          {doc.module_title || '❌ Missing'}
                        </div>
                        {doc.module_id && (
                          <div className="text-xs text-gray-500">{doc.module_id.slice(0, 8)}...</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {hasIssues ? (
                      <span className="text-xs text-red-600 font-semibold">Needs Fix</span>
                    ) : (
                      <span className="text-xs text-green-600">✓ OK</span>
                    )}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(doc)}
                          disabled={processing}
                          className="text-green-600 hover:text-green-800 text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => cancelEdit(doc.id)}
                          className="text-gray-600 hover:text-gray-800 text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(doc)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Edit
                        </button>
                        {doc.status === 'replaced' ? (
                          <span className="text-gray-400 text-xs">Archived</span>
                        ) : (
                          <button
                            onClick={() => archiveDocument(doc)}
                            className="text-amber-600 hover:text-amber-800 text-xs"
                          >
                            Archive
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {documents.length === 0 && (
        <div className="border rounded-md p-4 text-gray-600">
          No documents found in the database.
        </div>
      )}
    </div>
  );
}