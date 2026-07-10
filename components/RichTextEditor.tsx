// @ts-nocheck
"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { useState, useCallback, useEffect } from 'react';

interface RichTextEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  moduleId?: string;
  onEditorReady?: (editor: any) => void;
}

export default function RichTextEditor({ 
  initialContent = '', 
  onChange, 
  placeholder = 'Write your content…',
  moduleId,
  onEditorReady
}: RichTextEditorProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadMode, setImageUploadMode] = useState<'url' | 'file'>('url');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextStyle,
      Color,
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-md cursor-pointer',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      FontFamily.configure({
        types: ['textStyle'],
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] p-3',
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          const fileReader = new FileReader();
          
          fileReader.onload = (e) => {
            const { schema } = view.state;
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (coordinates && e.target?.result) {
              const node = schema.nodes.image.create({ src: e.target.result });
              const transaction = view.state.tr.insert(coordinates.pos, node);
              view.dispatch(transaction);
            }
          };
          
          if (file.type.startsWith('image/')) {
            fileReader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.indexOf('image') === 0) {
            const file = item.getAsFile();
            if (file && moduleId) {
              // Upload pasted image
              const uploadPastedImage = async () => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('moduleId', moduleId);
                
                try {
                  const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData,
                  });
                  
                  if (response.ok) {
                    const data = await response.json();
                    if (data.url) {
                      const { schema } = view.state;
                      const node = schema.nodes.image.create({ src: data.url });
                      const transaction = view.state.tr.replaceSelectionWith(node);
                      view.dispatch(transaction);
                    }
                  }
                } catch (error) {
                  console.error('Failed to upload pasted image:', error);
                }
              };
              
              uploadPastedImage();
              return true;
            }
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  // Expose the live editor instance so the parent can read the current HTML
  // directly at save time (avoids relying on a possibly-stale React state closure).
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // When fresh server content arrives (e.g. after a save + reload), sync it into
  // the editor. This only runs when `initialContent` actually changes, so it never
  // clobbers the user's in-progress edits.
  useEffect(() => {
    if (editor && typeof initialContent === 'string' && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, editor]);

  const addImage = useCallback(() => {
    if (imageUrl && editor) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl('');
      setShowImageDialog(false);
      setImageUploadMode('url');
    }
  }, [editor, imageUrl]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !moduleId) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('moduleId', moduleId);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      const data = await response.json();
      if (data.url) {
        editor.chain().focus().setImage({ src: data.url }).run();
        setShowImageDialog(false);
        setImageUploadMode('url');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
      // Reset file input
      e.target.value = '';
    }
  }, [editor, moduleId]);

  // Add image size controls - Define this before the early return
  const setImageSize = useCallback((size: 'small' | 'medium' | 'large' | 'full') => {
    if (!editor) return;
    
    const sizeMap = {
      small: '25%',
      medium: '50%',
      large: '75%',
      full: '100%'
    };
    
    const { state } = editor;
    const { selection } = state;
    const node = state.doc.nodeAt(selection.from);
    
    if (node && node.type.name === 'image') {
      editor.chain().focus().updateAttributes('image', {
        style: `width: ${sizeMap[size]}; height: auto;`
      }).run();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  // Define available fonts
  const fonts = [
    { label: 'Default', value: '' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Verdana', value: 'Verdana' },
    { label: 'Comic Sans MS', value: 'Comic Sans MS' },
  ];

  // Define available colors
  const colors = [
    '#000000', // Black
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    '#FFFF00', // Yellow
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFA500', // Orange
    '#800080', // Purple
    '#FFC0CB', // Pink
    '#808080', // Gray
    '#8B4513', // Brown
  ];

  return (
    <div className="border rounded-md">
      {/* Toolbar */}
      <div className="border-b p-2 flex flex-wrap gap-1 bg-gray-50">
        {/* Font Family */}
        <select
          className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
          onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
          value={editor.getAttributes('textStyle').fontFamily || ''}
        >
          {fonts.map(font => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Text Formatting */}
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

        {/* Text Color */}
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

        {/* Lists */}
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

        {/* Alignment */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
            editor.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''
          }`}
          title="Align Left"
        >
          ⬅
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
            editor.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''
          }`}
          title="Align Center"
        >
          ↔
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${
            editor.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''
          }`}
          title="Align Right"
        >
          ➡
        </button>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Headings */}
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

        {/* Image */}
        <div className="relative group">
          <button
            onClick={() => setShowImageDialog(true)}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200"
            title="Insert Image"
            type="button"
          >
            🖼️ Image
          </button>
          {editor.isActive('image') && (
            <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg p-2 hidden group-hover:flex gap-1 z-10">
              <button
                type="button"
                onClick={() => setImageSize('small')}
                className="px-2 py-1 text-xs rounded hover:bg-gray-100"
                title="Small (25%)"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => setImageSize('medium')}
                className="px-2 py-1 text-xs rounded hover:bg-gray-100"
                title="Medium (50%)"
              >
                M
              </button>
              <button
                type="button"
                onClick={() => setImageSize('large')}
                className="px-2 py-1 text-xs rounded hover:bg-gray-100"
                title="Large (75%)"
              >
                L
              </button>
              <button
                type="button"
                onClick={() => setImageSize('full')}
                className="px-2 py-1 text-xs rounded hover:bg-gray-100"
                title="Full (100%)"
              >
                Full
              </button>
            </div>
          )}
        </div>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Clear Formatting */}
        <button
          type="button"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className="px-2 py-1 text-sm rounded hover:bg-gray-200"
          title="Clear Formatting"
        >
          Clear
        </button>
      </div>

      {/* Image Dialog */}
      {showImageDialog && (
        <div className="border-b bg-blue-50 p-3">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setImageUploadMode('file')}
              className={`px-3 py-1 text-sm rounded ${imageUploadMode === 'file' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              📁 Upload File
            </button>
            <button
              type="button"
              onClick={() => setImageUploadMode('url')}
              className={`px-3 py-1 text-sm rounded ${imageUploadMode === 'url' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              🔗 Use URL
            </button>
          </div>
          
          {imageUploadMode === 'url' ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addImage();
                  }
                }}
                placeholder="Enter image URL..."
                className="flex-1 px-2 py-1 text-sm border rounded"
                autoFocus
              />
              <button
                type="button"
                onClick={addImage}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImageDialog(false);
                  setImageUrl('');
                }}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {moduleId ? (
                <>
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
                </>
              ) : (
                <span className="text-sm text-gray-600">Image upload requires a module ID</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowImageDialog(false);
                  setImageUploadMode('url');
                }}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor Content */}
      <div className="p-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}