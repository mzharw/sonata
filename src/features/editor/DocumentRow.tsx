import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import type { DocumentSummary } from "../../types/domain";
import { useUi } from "../../stores/ui";
import { useDocumentEditor } from "../../hooks/useDocumentEditor";
import { StatusSelect } from "../../components/StatusSelect";
import { DocumentMetaBar } from "../../components/DocumentMetaBar";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/MarkdownEditor";
import { AttachmentButton } from "../../components/AttachmentButton";
import { attachToDocument, chooseAndImportAttachment, importClipboardImage } from "../../lib/attachments";
import { useAttachmentUrls } from "../../hooks/useAttachmentUrls";
import { TYPE_SPECS, type RowChip } from "../../lib/documentTypes";
import { TypeSelect } from "../../components/TypeSelect";
import { BacklinksPanel } from "../../components/BacklinksPanel";
import { useTypeConversion } from "../../hooks/useTypeConversion";
import { STATUS_OPTIONS } from "../../lib/statusOptions";
import { stageLabel } from "../../lib/stageOptions";
import { urlDomain } from "../../lib/url";
import { wordCount } from "../../lib/wordCount";
import { renderMarkdownPreview } from "../../lib/renderMarkdown";
import { relativeTime, absoluteDate, exactTimestamp } from "../../lib/formatTimestamp";
import { IconStatusDone, IconStatusTodo, IconPin, IconFlag, IconArchive, IconTrash, IconMaximize, IconCheck, IconCopy, IconPencil, IconPencilLine, IconMarkdown, IconLink, IconExternalLink } from "../../components/icons";
import type { TaskStatus } from "../../types/domain";
import type { DocumentAttention } from "../../lib/attention";

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

export function DocumentRow({ doc, isActive, attention, onAcknowledge, onToggleComplete, onTogglePin, onUpdateStatus }: { doc: DocumentSummary; isActive: boolean; attention?: DocumentAttention; onAcknowledge: (doc: DocumentSummary, attention: DocumentAttention) => void; onToggleComplete: (doc: DocumentSummary) => void; onTogglePin: (doc: DocumentSummary) => void; onUpdateStatus: (doc: DocumentSummary, status: TaskStatus | undefined) => void }) {
  const ui = useUi();
  const qc = useQueryClient();
  const expanded = ui.expandedId === doc.id;
  const { doc: full, setDoc: setFull, replaceDoc: replaceFull, status: saveStatus, save } = useDocumentEditor(expanded ? doc.id : undefined);
  const spec = TYPE_SPECS[doc.type];
  const TypeIcon = spec.icon;
  const { convert } = useTypeConversion();

  // Flush any pending edit before converting, so the conversion reads a current file and
  // cannot trip a write conflict against its own unsaved changes.
  const convertTo = async (to: Parameters<typeof convert>[1]) => {
    if (expanded) await save();
    await convert(doc, to, expanded ? replaceFull : undefined);
  };
  const bodyEditorRef = useRef<MarkdownEditorHandle>(null);
  const headerSentinelRef = useRef<HTMLSpanElement>(null);
  const [rawActive, setRawActive] = useState(false);
  const [headerIsStuck, setHeaderIsStuck] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const preview = useQuery({ queryKey: ["preview", doc.id], queryFn: () => native.readDocument(doc.id), enabled: showPreview, staleTime: 60_000 });
  const previewVisible = Boolean(showPreview && preview.data?.body.trim());
  const previewTruncated = (preview.data?.body.length ?? 0) > 500;
  const attachmentUrls = useAttachmentUrls(full?.body ?? preview.data?.body ?? "", full?.cover);

  const startPreviewTimer = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setShowPreview(true), HOVER_PREVIEW_DELAY_MS);
  };

  const cancelPreview = () => {
    clearTimeout(hoverTimer.current);
    setShowPreview(false);
  };

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // The list itself is the scrollport, immediately below the tags bar (or the
  // top bar when no tags are shown). Keep the row in its ordinary layout until
  // this marker has crossed that boundary, then let the row dock there.
  useEffect(() => {
    if (!expanded) {
      setHeaderIsStuck(false);
      return;
    }

    const sentinel = headerSentinelRef.current;
    const scrollport = sentinel?.closest<HTMLElement>(".document-list");
    if (!sentinel || !scrollport) return;

    if (!("IntersectionObserver" in window)) {
      // All supported desktop webviews provide this, but preserve the previous
      // sticky behavior for an older browser-only development environment.
      setHeaderIsStuck(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setHeaderIsStuck(!entry.isIntersecting),
      { root: scrollport, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [expanded]);

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
    if (expanded) document.getElementById(`doc-${doc.id}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, doc.id]);

  return (
    <li id={`doc-${doc.id}`} className={`doc doc-type-${doc.type}${expanded ? " expanded" : ""}${previewVisible ? " previewing" : ""}${isActive ? " is-active" : ""}${doc.pinned ? " pinned" : ""}${attention ? " needs-attention" : ""}`}>
      {expanded && <span ref={headerSentinelRef} className="doc-header-sentinel" aria-hidden="true" />}
      <div
        className={`doc-row${headerIsStuck ? " is-sticky" : ""}`}
        onClick={() => {
          cancelPreview();
          if (attention) onAcknowledge(doc, attention);
          ui.expand(expanded ? undefined : doc.id);
        }}
        onMouseEnter={() => {
          if (!expanded) startPreviewTimer();
        }}
        onMouseLeave={cancelPreview}
      >
        {spec.affordance === "checkbox" ? (
          <button className="check" aria-label={doc.status === "completed" ? "Mark as todo" : "Mark as completed"} title={doc.status === "completed" ? "Mark as todo" : "Mark as completed"} onClick={(e) => { e.stopPropagation(); onToggleComplete(doc); }}>
            {doc.status === "completed" ? <IconStatusDone /> : <IconStatusTodo />}
          </button>
        ) : (
          <span className="check" aria-hidden="true" title={spec.label}><TypeIcon size={15} /></span>
        )}
        <div className="doc-main">
          <b className={doc.status === "completed" ? "is-completed" : undefined}>{doc.title || "Untitled"}</b>
          {attention && <span className="attention-inline" role="status">{attention.labels.join(" · ")}</span>}
          {(() => {
            // Which chips a row shows is the type's business, so a note carrying legacy
            // `status:`/`due:` frontmatter stops advertising fields it no longer owns.
            const showStatus = doc.status && doc.status !== "todo" && !(spec.affordance === "checkbox" && doc.status === "completed");
            const statusMeta = showStatus ? STATUS_OPTIONS.find((o) => o.value === doc.status) : undefined;
            const StatusIcon = statusMeta?.icon;
            const domain = doc.bookmark?.url ? urlDomain(doc.bookmark.url) : undefined;
            const chips: Record<RowChip, ReactNode> = {
              status: showStatus ? (
                <span className={`status-inline status-${doc.status}`}>
                  {StatusIcon && <StatusIcon size={11} fill="currentColor" />} {statusMeta?.label}
                </span>
              ) : null,
              stage: doc.stage ? (
                <span className={`stage-inline stage-${doc.stage}`}>{stageLabel(doc.stage)}</span>
              ) : null,
              domain: domain ? (
                <span className="domain-inline" title={doc.bookmark?.url}>
                  <IconLink size={11} /> {domain}
                </span>
              ) : null,
              tags: doc.tags.length > 0 ? (
                <>
                  {doc.tags.slice(0, MAX_VISIBLE_TAGS).map((t) => (
                    <span className="tag-inline" key={t}>#{t}</span>
                  ))}
                  {doc.tags.length > MAX_VISIBLE_TAGS && <span className="tag-inline more">+{doc.tags.length - MAX_VISIBLE_TAGS}</span>}
                </>
              ) : null,
              due: doc.due ? (() => {
                const { label, overdue } = dueMeta(doc.due, doc.status);
                return <span className={`due-inline${overdue ? " overdue" : ""}`} title={doc.due}>{label}</span>;
              })() : null,
              // Children keep pointing at a converted parent by design, so the count can
              // be non-zero for a type that has no subtasks — the spec decides, not the count.
              progress: doc.childCount > 0 ? (
                <span className={`progress-inline${doc.completedChildCount === doc.childCount ? " done" : ""}`}>{doc.completedChildCount}/{doc.childCount}</span>
              ) : null,
              priority: doc.priority && doc.priority !== "none" ? (
                <span className={`priority-inline priority-${doc.priority}`}>
                  <IconFlag size={11} fill="currentColor" /> {doc.priority}
                </span>
              ) : null,
            };
            const visible = spec.rowChips.filter((chip) => chips[chip] !== null);
            if (visible.length === 0) return null;
            return (
              <small>
                {visible.map((chip) => (
                  <Fragment key={chip}>{chips[chip]}</Fragment>
                ))}
              </small>
            );
          })()}
        </div>
        <button className={`icon-btn pin-btn${doc.pinned ? " is-pinned" : ""}`} aria-label={doc.pinned ? "Unpin" : "Pin"} title={doc.pinned ? "Unpin" : "Pin"} onClick={(e) => { e.stopPropagation(); onTogglePin(doc); }}>
          <IconPin size={15} fill={doc.pinned ? "currentColor" : "none"} />
        </button>
        <div className="doc-actions">
          {spec.meta.includes("status") && (
            <span className="doc-status-action" onClick={(e) => e.stopPropagation()}>
              <StatusSelect value={doc.status} onChange={(status) => onUpdateStatus(doc, status)} compact />
            </span>
          )}
          {doc.type === "bookmark" && doc.bookmark?.url && (
            <button
              className="icon-btn"
              aria-label="Open link in browser"
              title={doc.bookmark.url}
              onClick={(e) => {
                e.stopPropagation();
                void native.openExternal(doc.bookmark!.url);
              }}
            >
              <IconExternalLink size={15} />
            </button>
          )}
          {spec.convertsTo.length > 0 && (
            <span className="doc-type-action" onClick={(e) => e.stopPropagation()}>
              <TypeSelect
                value={doc.type}
                types={[doc.type, ...spec.convertsTo]}
                onChange={(to) => void convertTo(to)}
                ariaLabel={`${spec.convertVerb} "${doc.title || "Untitled"}"`}
                compact
              />
            </span>
          )}
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
        <div
          className={`doc-preview${previewVisible ? " expanded" : ""}${previewTruncated ? " truncated" : ""}`}
          onClick={() => {
            cancelPreview();
            ui.expand(doc.id);
          }}
        >
          {preview.data?.body.trim() && <div className="md-prose" onClick={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const path = target.closest("a")?.getAttribute("href");
            if (!path?.match(/^attachments\/[A-Za-z0-9_./-]+$/)) return;
            event.preventDefault();
            event.stopPropagation();
            revealAttachment(path);
          }} dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(preview.data.body, 500, attachmentUrls) }} />}
        </div>
      )}
      {expanded && !full && <div className="editor-loading">Loading…</div>}
      {expanded && full && (
        <article className="editor">
          {(spec.longForm || full.cover) && (
            <div className="note-cover">
              {full.cover && attachmentUrls[full.cover] && <img src={attachmentUrls[full.cover]} alt="Note cover" />}
              <AttachmentButton className="note-cover-attach" doc={full} onChange={setFull} onNotice={(message) => ui.showToast({ message })} />
            </div>
          )}
          <div className="editor-title-wrap">
            <input className="editor-title" aria-label="Title" value={full.title} onChange={(e) => setFull({ ...full, title: e.target.value })} onBlur={() => void save()} />
            <IconPencil className="editor-title-pen" size={15} aria-hidden="true" />
          </div>
          <DocumentMetaBar doc={full} onChange={setFull} onChangeType={(to) => void convertTo(to)} />
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
            onOpenExternal={(url) => void native.openExternal(url)}
          />
          <div className="editor-footer">
            <span className="editor-timestamps">
              <span title={exactTimestamp(full.created)}>Created {absoluteDate(full.created)}</span>
              <span aria-hidden="true">·</span>
              <span title={exactTimestamp(full.updated)}>Edited {relativeTime(full.updated)}</span>
              {spec.longForm && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="editor-wordcount">{wordCount(full.body)} words</span>
                </>
              )}
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
          {spec.longForm && <BacklinksPanel id={doc.id} />}
        </article>
      )}
    </li>
  );
}
