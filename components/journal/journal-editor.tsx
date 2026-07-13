'use client';

import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JournalEditorProps {
  initialContent: any | null;
  onSave: (content: any, textContent: string) => void;
  readOnly?: boolean;
}

export function JournalEditor({ initialContent, onSave, readOnly = false }: JournalEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'What happened today?',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: initialContent || '',
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn(
          'prose-custom focus:outline-none w-full',
          !readOnly && 'min-h-[400px] bg-base p-4'
        ),
      },
    },
    onUpdate: ({ editor }) => {
      setIsSaving(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      saveTimeoutRef.current = setTimeout(() => {
        onSaveRef.current(editor.getJSON(), editor.getText());
        setIsSaving(false);
      }, 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Update content if initialContent changes (e.g. date changes)
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const currentJson = editor.getJSON();
      // Only set content if it's materially different to prevent losing focus/cursor
      if (JSON.stringify(currentJson) !== JSON.stringify(initialContent || {})) {
        editor.commands.setContent(initialContent || '');
      }
    }
  }, [editor, initialContent]);

  if (!editor) {
    return (
      <div 
        className={cn(
          "w-full animate-pulse bg-base",
          !readOnly ? "min-h-[400px] rounded-card border border-hairline" : "h-10"
        )} 
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {!readOnly && (
        <div className="flex items-center gap-1 border border-hairline border-b-0 rounded-t-card bg-surface px-2 py-2">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('bold') ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('italic') ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          
          <div className="w-px h-4 bg-hairline mx-1" />
          
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('heading', { level: 1 }) ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Heading 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('heading', { level: 2 }) ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Heading 2"
          >
            <Heading2 size={16} />
          </button>

          <div className="w-px h-4 bg-hairline mx-1" />

          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('bulletList') ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Bullet List"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('orderedList') ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Ordered List"
          >
            <ListOrdered size={16} />
          </button>
          
          <div className="ml-auto flex items-center">
             <span className={cn(
               "text-[10px] uppercase tracking-wide transition-opacity",
               isSaving ? "opacity-100 text-tertiary" : "opacity-0"
             )}>
               Saving...
             </span>
          </div>
        </div>
      )}
      <div className={cn(
        "flex-1 overflow-hidden",
        !readOnly && "border border-hairline rounded-b-card"
      )}>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
