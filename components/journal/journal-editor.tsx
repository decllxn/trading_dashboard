'use client';

import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/button';

interface JournalEditorProps {
  initialContent: any | null;
  onSave: (content: any, textContent: string) => void;
  readOnly?: boolean;
}

export function JournalEditor({ initialContent, onSave, readOnly = false }: JournalEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  const isDirtyRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

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
    onUpdate: () => {
      setIsDirty(true);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && editorRef.current) {
        onSaveRef.current(editorRef.current.getJSON(), editorRef.current.getText());
      }
    };
  }, []);

  // Update content if initialContent changes (e.g. date changes) and user is not typing
  useEffect(() => {
    if (editor && !editor.isFocused && initialContent !== undefined) {
      const currentJson = editor.getJSON();
      // Only set content if it's materially different to prevent losing focus/cursor
      if (JSON.stringify(currentJson) !== JSON.stringify(initialContent || {})) {
        editor.commands.setContent(initialContent || '');
        setIsDirty(false);
      }
    }
  }, [editor, initialContent]);

  if (!editor) {
    return (
      // Static skeleton — no decorative pulse (DS motion is count-up + hover only).
      <div
        className="w-full bg-base h-[520px] rounded-card border border-hairline"
      />
    );
  }

  const handleSaveClick = async () => {
    if (!editor || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveRef.current(editor.getJSON(), editor.getText());
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to save journal entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[520px] w-full border border-hairline rounded-card bg-surface overflow-hidden">
      {!readOnly && (
        <div className="flex items-center gap-1 border-b border-hairline bg-surface px-2 py-2 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
            type="button"
            onMouseDown={(e) => e.preventDefault()}
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
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "p-1.5 rounded transition-colors",
              editor.isActive('orderedList') ? "bg-accent-signal/20 text-accent-signal" : "text-secondary hover:text-primary hover:bg-surface-raised"
            )}
            title="Ordered List"
          >
            <ListOrdered size={16} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 bg-base">
        <EditorContent editor={editor} />
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between border-t border-hairline bg-surface px-4 py-2.5 shrink-0">
          <div className="flex items-center">
            {isSaving ? (
              <div className="flex items-center gap-2">
                {/* Static status dot — no decorative motion (DS: only count-up
                    + 150ms hover transitions). */}
                <span className="h-1.5 w-1.5 rounded-sm bg-accent-signal" />
                <span className="num text-[10px] uppercase tracking-wide text-primary">
                  Syncing to database…
                </span>
              </div>
            ) : isDirty ? (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-sm bg-secondary" />
                <span className="num text-[10px] uppercase tracking-wide text-secondary">
                  Unsaved changes
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-accent-signal" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="num text-[10px] uppercase tracking-wide font-semibold text-accent-signal">
                  Changes persisted
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={handleSaveClick}
            disabled={isSaving || !isDirty}
            className="px-4 py-1.5 text-xs font-semibold"
          >
            Save Entry
          </Button>
        </div>
      )}
    </div>
  );
}
