// @ts-nocheck
"use client";

import { useState, useTransition, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { FileText, Upload, Link as LinkIcon, ImageIcon, X } from 'lucide-react';

interface NoticeRichDescriptionEditorProps {
  noticeId: string;
  initialContent: string;
  updateAction: (formData: FormData) => Promise<void>;
}

export default function NoticeRichDescriptionEditor({
  noticeId,
  initialContent,
  updateAction,
}: NoticeRichDescriptionEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [imageUploadMode, setImageUploadMode] = useState<'url' | 'file'>('file');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextStyle,
      Color,
      Underline,
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-md',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      FontFamily.configure({
        types: ['textStyle'],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-800',
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] p-3',
      },
    },
    immediatelyRender: false,
  });

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image size should be less than 10MB');
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('noticeId', noticeId);
      formData.append('fileType', 'image');

      const response = await fetch('/api/upload-notice-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload image');
      }

      const data = await response.json();
      if (data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
        setShowImageDialog(false);
        setImageUploadMode('file');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  }, [editor, noticeId]);

  const addImageFromUrl = useCallback(() => {
    if (imageUrl && editor) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl('');
      setShowImageDialog(false);
      setImageUploadMode('file');
    }
  }, [editor, imageUrl]);

  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('PDF size should be less than 50MB');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('noticeId', noticeId);
      formData.append('fileType', 'pdf');

      const response = await fetch('/api/upload-notice-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload PDF');
      }

      const data = await response.json();
      if (data.url) {
        const escapedName = (data.originalName || 'Attached PDF')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        const escapedUrl = data.url.replace(/"/g, '&quot;');
        const pdfHtml = `<p><a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md hover:bg-gray-200 text-sm">📄 ${escapedName}</a></p>`;
        editor.chain().focus().insertContent(pdfHtml).run();
        setShowPdfDialog(false);
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload PDF. Please try again.');
    } finally {
      setIsUploadingPdf(false);
      e.target.value = '';
    }
  }, [editor, noticeId]);

  const addLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl) {
      const trimmedUrl = linkUrl.trim().toLowerCase();
      if (trimmedUrl.startsWith('javascript:') || trimmedUrl.startsWith('data:')) {
        alert('Invalid URL. Please enter a valid http or https URL.');
        return;
      }
      
      let safeUrl = linkUrl.trim();
      if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://') && !safeUrl.startsWith('/')) {
        safeUrl = 'https://' + safeUrl;
      }
      
      const escapedUrl = safeUrl.replace(/"/g, '&quot;');
      const escapedText = linkText
        ? linkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : escapedUrl;
      
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedText}</a>`)
        .run();
      
      setLinkUrl('');
      setLinkText('');
      setShowLinkDialog(false);
    }
  }, [editor, linkUrl, linkText]);

  const removeLink = useCallback(() => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  }, [editor]);

  const handleSubmit = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('notice_id', noticeId);
      formData.set('description', content);
      await updateAction(formData);
    });
  };

  if (!editor) {
    return <div className="border rounded-md p-3 min-h-[200px] bg-gray-50 animate-pulse" />;
  }

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
    '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#808080', '#8B4513',
  ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Description</label>
      <div className="border rounded-md">
        <div className="border-b p-2 flex flex-wrap gap-1 bg-gray-50">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 font-bold ${
              editor.isActive('bold') ? 'bg-gray-300' : ''
            }`}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 italic ${
              editor.isActive('italic') ? 'bg-gray-300' : ''
            }`}
            title="Italic"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 underline ${
              editor.isActive('underline') ? 'bg-gray-300' : ''
            }`}
            title="Underline"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 line-through ${
              editor.isActive('strike') ? 'bg-gray-300' : ''
            }`}
            title="Strikethrough"
          >
            S
          </button>

          <div className="w-px bg-gray-300 mx-1" />

          <div className="relative group">
            <button
              type="button"
              className="px-2 py-1 text-sm rounded hover:bg-gray-200 flex items-center gap-1"
              title="Text Color"
            >
              <span>A</span>
              <div className="w-4 h-1 bg-current" style={{ color: editor.getAttributes('textStyle').color || '#000000' }} />
            </button>
            <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg p-2 hidden group-hover:grid grid-cols-6 gap-1 z-10">
              {colors.map(color => (
                <button
                  type="button"
                  key={color}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  className="w-6 h-6 rounded hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <button
                type="button"
                onClick={() => editor.chain().focus().unsetColor().run()}
                className="col-span-6 text-xs py-1 hover:bg-gray-100 rounded"
              >
                Reset Color
              </button>
            </div>
          </div>

          <div className="w-px bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
              editor.isActive('bulletList') ? 'bg-gray-300' : ''
            }`}
            title="Bullet List"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
              editor.isActive('orderedList') ? 'bg-gray-300' : ''
            }`}
            title="Numbered List"
          >
            1. List
          </button>

          <div className="w-px bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
              editor.isActive('heading', { level: 1 }) ? 'bg-gray-300' : ''
            }`}
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
              editor.isActive('heading', { level: 2 }) ? 'bg-gray-300' : ''
            }`}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
              editor.isActive('heading', { level: 3 }) ? 'bg-gray-300' : ''
            }`}
            title="Heading 3"
          >
            H3
          </button>

          <div className="w-px bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => setShowImageDialog(true)}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200 flex items-center gap-1"
            title="Insert Image"
          >
            <ImageIcon className="h-4 w-4" />
            Image
          </button>

          <button
            type="button"
            onClick={() => setShowLinkDialog(true)}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 flex items-center gap-1 ${
              editor.isActive('link') ? 'bg-gray-300' : ''
            }`}
            title="Insert Link"
          >
            <LinkIcon className="h-4 w-4" />
            Link
          </button>

          <button
            type="button"
            onClick={() => setShowPdfDialog(true)}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200 flex items-center gap-1"
            title="Attach PDF"
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>

          <div className="w-px bg-gray-300 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200"
            title="Clear Formatting"
          >
            Clear
          </button>
        </div>

        {showImageDialog && (
          <div className="border-b bg-blue-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImageUploadMode('file')}
                  className={`px-3 py-1 text-sm rounded ${imageUploadMode === 'file' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'}`}
                >
                  <Upload className="h-4 w-4 inline mr-1" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setImageUploadMode('url')}
                  className={`px-3 py-1 text-sm rounded ${imageUploadMode === 'url' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'}`}
                >
                  <LinkIcon className="h-4 w-4 inline mr-1" />
                  Use URL
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setShowImageDialog(false); setImageUrl(''); }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {imageUploadMode === 'file' ? (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUploadingImage}
                  className="flex-1 px-2 py-1 text-sm border rounded bg-white"
                />
                {isUploadingImage && (
                  <span className="text-sm text-gray-600">Uploading...</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Enter image URL..."
                  className="flex-1 px-2 py-1 text-sm border rounded"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={addImageFromUrl}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {showLinkDialog && (
          <div className="border-b bg-green-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Insert Link</span>
              <button
                type="button"
                onClick={() => { setShowLinkDialog(false); setLinkUrl(''); setLinkText(''); }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Enter URL (e.g., https://example.com)..."
                className="w-full px-2 py-1 text-sm border rounded"
                autoFocus
              />
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link text (optional, uses selection or URL if empty)..."
                className="w-full px-2 py-1 text-sm border rounded"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addLink}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Add Link
                </button>
                {editor.isActive('link') && (
                  <button
                    type="button"
                    onClick={removeLink}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Remove Link
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showPdfDialog && (
          <div className="border-b bg-amber-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Attach PDF Document</span>
              <button
                type="button"
                onClick={() => setShowPdfDialog(false)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                disabled={isUploadingPdf}
                className="flex-1 px-2 py-1 text-sm border rounded bg-white"
              />
              {isUploadingPdf && (
                <span className="text-sm text-gray-600">Uploading...</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Max file size: 50MB</p>
          </div>
        )}

        <div className="p-1">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save Description'}
        </button>
      </div>
    </div>
  );
}
