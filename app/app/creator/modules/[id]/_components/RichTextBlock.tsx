// @ts-nocheck
"use client";

import { useState, useTransition, useRef, useCallback } from 'react';
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
  const [isPending, startTransition] = useTransition();
  const editorRef = useRef<any>(null);
  const handleEditorReady = useCallback((ed: any) => { editorRef.current = ed; }, []);

  return (
    <form action={() => {
      startTransition(async () => {
        // Read the live HTML straight from the editor at save time so the edit is
        // never lost to a stale React state closure. Fall back to tracked state.
        const html = editorRef.current ? editorRef.current.getHTML() : content;
        const formData = new FormData();
        formData.set('module_id', moduleId);
        formData.set('block_id', blockId);
        formData.set('text', html);
        await updateAction(formData);
      });
    }} className="space-y-2">
      <label className="text-xs text-gray-600">Rich Text Content</label>
      <RichTextEditor
        initialContent={initialContent}
        onChange={setContent}
        onEditorReady={handleEditorReady}
        placeholder="Write your content with formatting…"
        moduleId={moduleId}
      />
      <div>
        <button 
          type="submit"
          disabled={isPending}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}