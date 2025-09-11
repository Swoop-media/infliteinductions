// @ts-nocheck
"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the editor to avoid SSR issues
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="border rounded-md p-3 min-h-[200px] bg-gray-50 animate-pulse" />
});

interface RichTextBlockProps {
  moduleId: string;
  blockId: string;
  initialContent: string;
  updateAction: any;
}

export default function RichTextBlock({ 
  moduleId, 
  blockId, 
  initialContent, 
  updateAction 
}: RichTextBlockProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const formData = new FormData();
    formData.set('module_id', moduleId);
    formData.set('block_id', blockId);
    formData.set('text', content);
    
    await updateAction(formData);
    setIsSaving(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-600">Rich Text Content</label>
      <RichTextEditor
        initialContent={initialContent}
        onChange={setContent}
        placeholder="Write your content with formatting…"
      />
      <div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}