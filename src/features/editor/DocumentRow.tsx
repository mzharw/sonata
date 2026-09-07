import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import type { DocumentSummary } from "../../types/domain";
import { useUi } from "../../stores/ui";
import { useDocumentEditor } from "../../hooks/useDocumentEditor";
import { StatusSelect } from "../../components/StatusSelect";
import { DocumentMetaBar } from "../../components/DocumentMetaBar";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/MarkdownEditor";
import { TYPE_ICON } from "../../lib/typeIcons";
import { STATUS_OPTIONS } from "../../lib/statusOptions";
import { renderMarkdownPreview } from "../../lib/renderMarkdown";
import { relativeTime, absoluteDate, exactTimestamp } from "../../lib/formatTimestamp";
import { IconStatusDone, IconStatusTodo, IconPin, IconFlag, IconArchive, IconTrash, IconMaximize, IconCheck, IconCopy, IconPencil, IconPencilLine, IconMarkdown } from "../../components/icons";
import type { TaskStatus } from "../../types/domain";

const HOVER_PREVIEW_DELAY_MS = 450;

const MAX_VISIBLE_TAGS = 4;

function dueMeta(due: string, status: DocumentSummary["status"]) {
  const [y, m, d] = due.split("-").map(Number);
  const dueDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  const overdue = status !== "completed" && diffDays < 0;
  let label = due;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Tomorrow";
  else if (diffDays === -1) label = "Yesterday";
  else if (diffDays > 1 && diffDays <= 6) label = `In ${diffDays}d`;
  else if (overdue && diffDays >= -6) label = `${-diffDays}d overdue`;
  return { label, overdue };
}

export function DocumentRow({ doc, isActive, onToggleComplete, onTogglePin, onUpdateStatus }: { doc: DocumentSummary; isActive: boolean; onToggleComplete: (doc: DocumentSummary) => void; onTogglePin: (doc: DocumentSummary) => void; onUpdateStatus: (doc: DocumentSummary, status: TaskStatus | undefined) => void }) {
  const ui = useUi();
  const qc = useQueryClient();
  const expanded = ui.expandedId === doc.id;
  const { doc: full, setDoc: setFull, status: saveStatus, save } = useDocumentEditor(expanded ? doc.id : undefined);
  const TypeIcon = TYPE_ICON[doc.type];
  const bodyEditorRef = useRef<MarkdownEditorHandle>(null);
  const [rawActive, setRawActive] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const preview = useQuery({ queryKey: ["preview", doc.id], queryFn: () => native.readDocument(doc.id), enabled: showPreview, staleTime: 60_000 });
  const previewVisible = Boolean(showPreview && preview.data?.body.trim());

  const startPreviewTimer = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setShowPreview(true), HOVER_PREVIEW_DELAY_MS);
  };

  const cancelPreview = () => {
    clearTimeout(hoverTimer.current);
    setShowPreview(false);
  };

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

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
    if (expanded) document.getElementById(`doc-${doc.id}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, doc.id]);

  return (
    <li id={`doc-${doc.id}`} className={`doc doc-type-${doc.type}${expanded ? " expanded" : ""}${previewVisible ? " previewing" : ""}${isActive ? " is-active" : ""}${doc.pinned ? " pinned" : ""}`}>
      <div
        className="doc-row"
        onClick={() => {
          cancelPreview();
          ui.expand(expanded ? undefined : doc.id);
        }}
        onMouseEnter={() => {
          if (!expanded) startPreviewTimer();
        }}
        onMouseLeave={cancelPreview}
      >
        {doc.type === "task" ? (
          <button className="check" aria-label={doc.status === "completed" ? "Mark as todo" : "Mark as completed"} title={doc.status === "completed" ? "Mark as todo" : "Mark as completed"} onClick={(e) => { e.stopPropagation(); onToggleComplete(doc); }}>
            {doc.status === "completed" ? <IconStatusDone /> : <IconStatusTodo />}
          </button>
        ) : (
          <span className="check" aria-hidden="true" title={doc.type}><TypeIcon size={15} /></span>
        )}
        <div className="doc-main">
          <b className={doc.status === "completed" ? "is-completed" : undefined}>{doc.title || "Untitled"}</b>
          {(() => {
            const showStatus = doc.status && doc.status !== "todo" && !(doc.type === "task" && doc.status === "completed");
            const statusMeta = showStatus ? STATUS_OPTIONS.find((o) => o.value === doc.status) : undefined;
            const StatusIcon = statusMeta?.icon;
            const hasMeta = doc.tags.length > 0 || doc.due || doc.childCount > 0 || (doc.priority && doc.priority !== "none") || showStatus;
            if (!hasMeta) return null;
            return (
              <small>
                {showStatus && (
                  <span className={`status-inline status-${doc.status}`}>
                    {StatusIcon && <StatusIcon size={11} fill="currentColor" />} {statusMeta?.label}
                  </span>
                )}
                {doc.tags.slice(0, MAX_VISIBLE_TAGS).map((t) => (
                  <span className="tag-inline" key={t}>#{t}</span>
                ))}
                {doc.tags.length > MAX_VISIBLE_TAGS && <span className="tag-inline more">+{doc.tags.length - MAX_VISIBLE_TAGS}</span>}
                {doc.due && (() => {
                  const { label, overdue } = dueMeta(doc.due, doc.status);
                  return <span className={`due-inline${overdue ? " overdue" : ""}`} title={doc.due}>{label}</span>;
                })()}
                {doc.childCount > 0 && (
                  <span className={`progress-inline${doc.completedChildCount === doc.childCount ? " done" : ""}`}>{doc.completedChildCount}/{doc.childCount}</span>
                )}
                {doc.priority && doc.priority !== "none" && (
                  <span className={`priority-inline priority-${doc.priority}`}>
                    <IconFlag size={11} fill="currentColor" /> {doc.priority}
                  </span>
                )}
              </small>
            );
          })()}
        </div>
        <button className={`icon-btn pin-btn${doc.pinned ? " is-pinned" : ""}`} aria-label={doc.pinned ? "Unpin" : "Pin"} title={doc.pinned ? "Unpin" : "Pin"} onClick={(e) => { e.stopPropagation(); onTogglePin(doc); }}>
          <IconPin size={15} fill={doc.pinned ? "currentColor" : "none"} />
        </button>
        <div className="doc-actions">
          <span className="doc-status-action" onClick={(e) => e.stopPropagation()}>
            <StatusSelect value={doc.status} onChange={(status) => onUpdateStatus(doc, status)} compact />
          </span>
          <button
            className="icon-btn"
            aria-label="Archive"
            title="Archive — moves it out of this list, into the Archive view"
            onClick={(e) => {
              e.stopPropagation();
              void native
                .archive(doc.id)
                .then(() => {
                  qc.invalidateQueries({ queryKey: ["documents"] });
                  ui.showToast({
                    message: `Archived "${doc.title || "Untitled"}"`,
                    onUndo: () => void native.unarchive(doc.id).then(() => qc.invalidateQueries({ queryKey: ["documents"] })),
                  });
                })
                .catch((error: unknown) => {
                  console.error("Failed to archive document", doc.id, error);
                  ui.showToast({ message: "Couldn't archive — see console for details" });
                });
            }}
          >
            <IconArchive size={15} />
          </button>
          <button
            className="icon-btn"
            aria-label="Trash"
            title="Move to trash"
            onClick={(e) => {
              e.stopPropagation();
              ui.requestConfirm({
                message: `Move "${doc.title || "Untitled"}" to trash?`,
                confirmLabel: "Move to trash",
                onConfirm: () =>
                  void native
                    .trash(doc.id)
                    .then(() => qc.invalidateQueries({ queryKey: ["documents"] }))
                    .catch((error: unknown) => {
                      console.error("Failed to trash document", doc.id, error);
                      ui.showToast({ message: "Couldn't move to trash — see console for details" });
                    }),
              });
            }}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>
      {!expanded && (
        <div className={`doc-preview${previewVisible ? " expanded" : ""}`}>
          {preview.data?.body.trim() && <div className="md-prose" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(preview.data.body) }} />}
        </div>
      )}
      {expanded && !full && <div className="editor-loading">Loading…</div>}
      {expanded && full && (
        <article className="editor">
          <div className="editor-title-wrap">
            <input className="editor-title" aria-label="Title" value={full.title} onChange={(e) => setFull({ ...full, title: e.target.value })} onBlur={() => void save()} />
            <IconPencil className="editor-title-pen" size={15} aria-hidden="true" />
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
          />
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
            <span className="editor-footer-actions">
              {(rawActive || full.body.trim() !== "") && (
                <button
                  className="icon-btn"
                  aria-label={rawActive ? "Back to block view" : "Edit whole document as text"}
                  title={rawActive ? "Back to block view" : "Edit whole document as text"}
                  aria-pressed={rawActive}
                  onClick={() => bodyEditorRef.current?.toggleRaw()}
                >
                  <IconPencilLine size={15} />
                </button>
              )}
              {full.body.trim() !== "" && (
                <button className="icon-btn" aria-label="Copy note content" title="Copy note content" onClick={() => void copyNoteContent()}>
                  <IconCopy size={15} />
                </button>
              )}
              <button className="icon-btn" aria-label="Open in full-screen editor" title="Open in full-screen editor" onClick={() => ui.openFullScreen(doc.id)}><IconMaximize size={15} /></button>
            </span>
          </div>
        </article>
      )}
    </li>
  );
}
