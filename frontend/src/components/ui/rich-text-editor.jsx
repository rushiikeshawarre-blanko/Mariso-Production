import React, { useEffect, useRef } from 'react';
import { normalizeEditorHtml } from '../../lib/richContent';

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const RichTextEditor = ({
  value = '',
  onChange,
  minHeightClassName = 'min-h-[260px]',
  editorClassName = '',
  testId = 'rich-text-editor',
}) => {
  const editorRef = useRef(null);
  const selectionRangeRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = value || '';
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [value]);

  const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return;

    selectionRangeRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const savedRange = selectionRangeRef.current;
    if (!selection || !savedRange) return;

    selection.removeAllRanges();
    selection.addRange(savedRange);
  };

  const handleToolbarMouseDown = (e) => {
    e.preventDefault();
    saveSelection();
  };

  const handleEditorInput = () => {
    const html = normalizeEditorHtml(editorRef.current?.innerHTML || '');
    onChange?.(html);
  };

  const insertListAtSelection = (listTag) => (e) => {
    e.preventDefault();
    if (!editorRef.current) return;

    editorRef.current.focus();
    restoreSelection();

    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const lines = selectedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const items = lines.length > 0 ? lines : ['List item'];
    const listHtml = `<${listTag}>${items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('')}</${listTag}><p><br></p>`;

    document.execCommand('insertHTML', false, listHtml);
    saveSelection();
    handleEditorInput();
  };

  const applyEditorCommand = (command, commandValue = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    saveSelection();
    handleEditorInput();
  };

  const handleAddLink = () => {
    saveSelection();
    const url = window.prompt('Enter the URL');
    if (!url) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('createLink', false, url);
    saveSelection();
    handleEditorInput();
  };

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={() => applyEditorCommand('bold')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => applyEditorCommand('italic')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => applyEditorCommand('underline')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Underline
        </button>
        <button
          type="button"
          onMouseDown={insertListAtSelection('ul')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Bullet List
        </button>
        <button
          type="button"
          onMouseDown={insertListAtSelection('ol')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Numbered List
        </button>
        <button
          type="button"
          onMouseDown={handleToolbarMouseDown}
          onClick={handleAddLink}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => applyEditorCommand('removeFormat')}
          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
        >
          Clear Format
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleEditorInput}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onFocus={saveSelection}
        className={`${minHeightClassName} w-full px-3 py-3 text-sm leading-7 outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1 ${editorClassName}`}
        data-testid={testId}
        style={{ whiteSpace: 'pre-wrap' }}
      />
    </div>
  );
};

export default RichTextEditor;
