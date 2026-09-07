import { useEffect, useRef, useState } from "react";
import { useUi } from "../../stores/ui";
import { useDocumentEditor } from "../../hooks/useDocumentEditor";
import { DocumentMetaBar } from "../../components/DocumentMetaBar";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/MarkdownEditor";
import { AttachmentButton } from "../../components/AttachmentButton";
import { attachToDocument, chooseAndImportAttachment, importClipboardImage } from "../../lib/attachments";
import { useAttachmentUrls } from "../../hooks/useAttachmentUrls";
import { native } from "../../lib/native";
import { IconArrowLeft, IconCheck, IconCopy, IconPencilLine, IconMarkdown } from "../../components/icons";
import { relativeTime, absoluteDate, exactTimestamp } from "../../lib/formatTimestamp";

export function FullScreenEditor({ id }: { id: string }) {
  const ui = useUi();
  const { doc: full, setDoc: setFull, status: saveStatus, save } = useDocumentEditor(id);
  const bodyEditorRef = useRef<MarkdownEditorHandle>(null);
  const [rawActive, setRawActive] = useState(false);
  const attachmentUrls = useAttachmentUrls(full?.body ?? "", full?.cover);

  const copyNoteContent = async () => {
    try {
      await navigator.clipboard.writeText(full?.body ?? "");
      ui.showToast({ message: "Copied note to clipboard" });
    } catch (error) {
      console.error("Failed to copy note content", error);
      ui.showToast({ message: "Couldn't copy — see console for details" });
    }
  };

  const attachFromBody = async () => {
    if (!full) return;
    try {
      const attachment = await chooseAndImportAttachment(full.id);
      if (!attachment) return;
      setFull(attachToDocument(full, attachment));
      ui.showToast({ message: attachment.mediaType.startsWith("image/") ? "Image attached to note" : "File attached to note" });
    } catch (error) {
      console.error("Couldn't attach file", error);
      ui.showToast({ message: "Couldn't attach file — see console for details" });
    }
  };

  const revealAttachment = (path: string) => {
    void native.revealAttachmentInExplorer(path).catch((error: unknown) => {
      console.error("Couldn't reveal attachment", path, error);
      ui.showToast({ message: "Couldn't open attachment in File Explorer" });
    });
  };

  const pasteImage = async (image: File) => {
    if (!full) throw new Error("Note is unavailable");
    try {
      const attachment = await importClipboardImage(full.id, image);
      ui.showToast({ message: "Image pasted into note" });
      return attachment;
    } catch (error) {
      console.error("Couldn't paste image", error);
      ui.showToast({ message: "Couldn't paste image — see console for details" });
      throw error;
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
          <div className="fs-title-wrap">
            <input aria-label="Title" value={full.title} onChange={(e) => setFull({ ...full, title: e.target.value })} onBlur={() => void save()} />
            <IconPencilLine className="editor-title-pen" size={15} aria-hidden="true" />
          </div>
        ) : (
          <span className="fs-title-placeholder">Loading…</span>
        )}
      </div>
      {full && (
        <>
          <div className="fs-body">
            <div className="note-cover">
              {full.cover && attachmentUrls[full.cover] && <img src={attachmentUrls[full.cover]} alt="Note cover" />}
              <AttachmentButton className="note-cover-attach" doc={full} onChange={setFull} onNotice={(message) => ui.showToast({ message })} />
            </div>
            <DocumentMetaBar doc={full} onChange={setFull} />
            <MarkdownEditor
              ref={bodyEditorRef}
              ariaLabel="Note body"
              placeholder="Click to write in Markdown…"
              value={full.body}
              onChange={(body) => setFull({ ...full, body })}
              onBlur={() => void save()}
              onRawChange={setRawActive}
              attachmentUrls={attachmentUrls}
              onAttach={() => void attachFromBody()}
              onPasteImage={pasteImage}
              onOpenAttachment={revealAttachment}
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
