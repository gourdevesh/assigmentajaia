import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

function Toolbar({ editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      style: e.isActive('heading', { level: 1 }) ? 'h1'
        : e.isActive('heading', { level: 2 }) ? 'h2'
        : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const setStyle = (value) => {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value[1]) }).run();
  };

  const Btn = ({ label, title, active, disabled, onClick, className = '' }) => (
    <button
      type="button"
      className={`tb-btn ${active ? 'is-active' : ''} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <select
        className="tb-select"
        aria-label="Text style"
        value={s.style}
        onChange={(e) => setStyle(e.target.value)}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="tb-sep" />
      <Btn label="B" title="Bold (Ctrl+B)" className="tb-bold" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Btn label="I" title="Italic (Ctrl+I)" className="tb-italic" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Btn label="U" title="Underline (Ctrl+U)" className="tb-underline" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <span className="tb-sep" />
      <Btn label="• List" title="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn label="1. List" title="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <span className="tb-sep" />
      <Btn label="Undo" title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()} />
      <Btn label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

/** Remount with key={doc.id} so each document gets a fresh editor state and undo history. */
export default function Editor({ initialContent, editable, onChange }) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initialContent,
    editable,
    editorProps: { attributes: { class: 'doc-body', 'aria-label': 'Document body' } },
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getHTML()),
  });

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <>
      {editable ? <Toolbar editor={editor} /> : <div className="readonly-note">You have view-only access to this document.</div>}
      <div className="desk">
        <article className="paper">
          <EditorContent editor={editor} />
        </article>
      </div>
    </>
  );
}
