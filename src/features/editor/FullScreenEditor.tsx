import { useEffect, useRef, useState } from "react";
import { useUi } from "../../stores/ui";
import { useDocumentEditor } from "../../hooks/useDocumentEditor";
import { DocumentMetaBar } from "../../components/DocumentMetaBar";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/MarkdownEditor";
import { IconArrowLeft, IconCheck, IconCopy, IconPencilLine, IconMarkdown } from "../../components/icons";
import { relativeTime, absoluteDate, exactTimestamp } from "../../lib/formatTimestamp";

export function FullScreenEditor({ id }: { id: string }) {
  const ui = useUi();
  const { doc: full, setDoc: setFull, status: saveStatus, save } = useDocumentEditor(id);
  const bodyEditorRef = useRef<MarkdownEditorHandle>(null);
  const [rawActive, setRawActive] = useState(false);

  const copyNoteContent = async () => {
    try {
      await navigator.clipboard.writeText(full?.body ?? "");
      ui.showToast({ message: "Copied note to clipboard" });
    } catch (error) {
      console.error("Failed to copy note content", error);
      ui.showToast({ message: "Couldn't copy — see console for details" });
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.openFullScreen(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ui]);

  return (
    <div className="fullscreen-editor">
      <div className="fs-topbar">
        <button className="icon-btn" aria-label="Back to list" onClick={() => ui.openFullScreen(undefined)}><IconArrowLeft /></button>
        {full ? (
          <input aria-label="Title" value={full.title} onChange={(e) => setFull({ ...full, title: e.target.value })} onBlur={() => void save()} />
        ) : (
          <span className="fs-title-placeholder">Loading…</span>
        )}
      </div>
      {full && (
        <>
          <div className="fs-body">
            <DocumentMetaBar doc={full} onChange={setFull} />
            <MarkdownEditor
              ref={bodyEditorRef}
              ariaLabel="Note body"
              placeholder="Click to write in Markdown…"
              value={full.body}
              onChange={(body) => setFull({ ...full, body })}
              onBlur={() => void save()}
              onRawChange={setRawActive}
            />
          </div>
          <div className="editor-footer">
            <span className="editor-timestamps">
              <span title={exactTimestamp(full.created)}>Created {absoluteDate(full.created)}</span>
              <span aria-hidden="true">·</span>
              <span title={exactTimestamp(full.updated)}>Edited {relativeTime(full.updated)}</span>
            </span>
            <span className={`save-status save-status-${saveStatus}`}>
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && (<><IconCheck size={12} /> Saved</>)}
              {saveStatus === "error" && "Couldn't save — will retry"}
              {saveStatus === "idle" && (
                <span className="save-status-format" title="Body is Markdown">
                  <IconMarkdown size={15} aria-label="Markdown" />
                </span>
              )}
            </span>
            {(rawActive || full.body.trim() !== "") && (
              <span className="editor-footer-actions">
                {full.body.trim() !== "" && (
                  <button className="icon-btn" aria-label="Copy note content" title="Copy note content" onClick={() => void copyNoteContent()}>
                    <IconCopy size={15} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  aria-label={rawActive ? "Back to block view" : "Edit whole document as text"}
                  title={rawActive ? "Back to block view" : "Edit whole document as text"}
                  aria-pressed={rawActive}
                  onClick={() => bodyEditorRef.current?.toggleRaw()}
                >
                  <IconPencilLine size={15} />
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
