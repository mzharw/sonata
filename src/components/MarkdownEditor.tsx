import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentType, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { marked, type Token } from "marked";
import DOMPurify from "dompurify";
import { IconEye, IconHelp, IconHeading, IconListBullets, IconCheckSquare, IconImagePlus } from "./icons";
import {
  COMMANDS,
  matchHotkey,
  wrapSelection,
  indentLines,
  outdentLines,
  continueListOnEnter,
  filterCommands,
  toggleNthTaskItem,
  WRAP_ON_TYPE,
  type Command,
  type Range,
} from "../lib/mdCommands";
import { getCaretCoordinates } from "../lib/caretPosition";
import { ShorthandMenu, type MenuAnchor } from "./ShorthandMenu";
import type { Attachment } from "../types/domain";

const MD_OPTS = { gfm: true, breaks: true } as const;

function renderTokensHtml(tokens: Token[], attachmentUrls: Record<string, string> = {}): string {
  if (tokens.length === 0) return "";
  const html = marked.parser(tokens, MD_OPTS) as string;
  // marked always renders GFM task-list checkboxes as `disabled` — strip that so they're
  // actually clickable straight from the preview, without needing to enter edit mode first.
  const interactive = html.replace(/<input\b([^>]*?)\sdisabled(?:="")?([^>]*)>/g, "<input$1$2>");
  const withLocalImages = interactive.replace(/(src=")(attachments\/[A-Za-z0-9_./-]+)(")/g, (_all, before: string, path: string, after: string) => `${before}${attachmentUrls[path] ?? path}${after}`);
  return DOMPurify.sanitize(withLocalImages);
}

function attachmentPathFromTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const href = target.closest("a")?.getAttribute("href");
  return href?.match(/^attachments\/[A-Za-z0-9_./-]+$/) ? href : undefined;
}

/**
 * marked's lexer can normalize a token's `.raw` text (e.g. trailing-space-only list
 * items become a trailing newline, CRLF gets collapsed to LF) instead of returning the
 * exact source slice. We only trust it for *lengths* (to find block boundaries) and
 * always read the actual text back out of `value` — and refuse to split into blocks at
 * all if the lengths don't add up, since that means we can no longer be sure where the
 * boundaries really are.
 */
function computeBlockRanges(value: string, tokens: Token[]): Array<{ start: number; end: number }> | null {
  let offset = 0;
  const ranges = tokens.map((t) => {
    const start = offset;
    offset += t.raw.length;
    return { start, end: offset };
  });
  return offset === value.length ? ranges : null;
}

type Segment =
  | { kind: "block"; prefixRaw: string; prefixHtml: string; suffixRaw: string; suffixHtml: string }
  | { kind: "all" }
  | null;

function BlockPreview({
  html,
  ariaLabel,
  onActivate,
  onToggleTask,
  onOpenAttachment,
}: {
  html: string;
  ariaLabel: string;
  onActivate: () => void;
  onToggleTask?: (index: number) => void;
  onOpenAttachment?: (path: string) => void;
}) {
  const proseRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="md-block"
      role="button"
      tabIndex={0}
      aria-label={`Edit ${ariaLabel}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const attachmentPath = attachmentPathFromTarget(target);
        if (attachmentPath && onOpenAttachment) {
          e.preventDefault();
          e.stopPropagation();
          onOpenAttachment(attachmentPath);
          return;
        }
        if (onToggleTask && target instanceof HTMLInputElement && target.type === "checkbox") {
          e.stopPropagation();
          const boxes = Array.from(proseRef.current?.querySelectorAll('input[type="checkbox"]') ?? []);
          const index = boxes.indexOf(target);
          if (index !== -1) onToggleTask(index);
          return;
        }
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <div
        ref={proseRef}
        className="md-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function SpacePreview({ raw, ariaLabel, onActivate }: { raw: string; ariaLabel: string; onActivate: () => void }) {
  const blankLines = Math.max(1, (raw.match(/\n/g)?.length ?? 1) - 1);
  return (
    <div
      className="md-block md-block-space"
      role="button"
      tabIndex={0}
      aria-label={`Edit ${ariaLabel}`}
      style={{ height: `${blankLines * 1.2}em` }}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    />
  );
}

const QUICK_START: Array<{ id: string; label: string; icon: ComponentType<{ size?: number }>; seed: string }> = [
  { id: "heading", label: "Heading", icon: IconHeading, seed: "## " },
  { id: "bullet", label: "Bullet list", icon: IconListBullets, seed: "- " },
  { id: "checklist", label: "Checklist", icon: IconCheckSquare, seed: "- [ ] " },
];

const ATTACHMENT_COMMAND: Command = {
  id: "attachment",
  label: "Attach file",
  icon: IconImagePlus,
  example: "Choose a file to insert",
  keywords: ["file", "image", "upload", "media"],
  // Attachment import is handled by the editor's owner because it needs the
  // current document id. This identity result only satisfies the shared menu
  // command shape; insertSlashCommand handles this id before calling apply.
  apply: (value, selection) => ({ value, ...selection }),
};

function EmptyPlaceholder({
  ariaLabel,
  placeholder,
  onActivate,
  onSeed,
}: {
  ariaLabel: string;
  placeholder?: string;
  onActivate: () => void;
  onSeed: (seed: string) => void;
}) {
  return (
    <div
      className="md-preview md-preview-empty"
      role="button"
      tabIndex={0}
      aria-label={`Edit ${ariaLabel}`}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <div className="md-preview-placeholder">
        <strong>This note is empty</strong>
        <span className="md-preview-placeholder-hint">{placeholder ?? "Click anywhere to start writing — or type / for a command menu"}</span>
        <div className="md-quick-start" role="group" aria-label="Quick start">
          {QUICK_START.map((qs) => {
            const Icon = qs.icon;
            return (
              <button
                key={qs.id}
                type="button"
                className="md-quick-start-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeed(qs.seed);
                }}
              >
                <Icon size={13} />
                {qs.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Finds the "/command" being typed immediately before the caret, if any.
 *
 * A slash only opens the menu at the start of a line or after whitespace — so it works
 * mid-paragraph and after a list marker ("- /"), which the old start-of-line-only rule
 * refused — but never inside a word, so "http://example.com" and "src/lib" stay text.
 */
function matchSlashTrigger(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const match = text.slice(lineStart, caret).match(/(?:^|\s)\/(\S*)$/);
  if (!match) return null;
  const query = match[1];
  return { start: caret - query.length - 1, query };
}

export interface MarkdownEditorHandle {
  /** Toggle between the per-block preview and editing the whole document as raw text. */
  toggleRaw: () => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel: string;
  /** Reports whether "edit whole document as text" mode is active, e.g. so a caller can render its own toggle button (see DocumentRow/FullScreenEditor). */
  onRawChange?: (raw: boolean) => void;
  attachmentUrls?: Record<string, string>;
  onAttach?: () => void;
  onPasteImage?: (image: File) => Promise<Attachment>;
  onOpenAttachment?: (path: string) => void;
}>(function MarkdownEditor({ value, onChange, onBlur, placeholder, ariaLabel, onRawChange, attachmentUrls, onAttach, onPasteImage, onOpenAttachment }, ref) {
  const [segment, setSegment] = useState<Segment>(null);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const pendingSelection = useRef<Range | null>(null);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashAnchor, setSlashAnchor] = useState(0);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashPos, setSlashPos] = useState<MenuAnchor>({ top: 0, left: 0 });

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPos, setHelpPos] = useState<MenuAnchor>({ top: 0, left: 0 });

  const tokens = useMemo(() => marked.lexer(value, MD_OPTS), [value]);
  const blockRanges = useMemo(() => computeBlockRanges(value, tokens), [value, tokens]);
  const isEmpty = value.trim() === "";
  const slashItems = useMemo(() => {
    const commands = filterCommands(slashQuery);
    const query = slashQuery.trim().toLowerCase();
    const attachmentMatches = !query || ATTACHMENT_COMMAND.label.toLowerCase().includes(query) || ATTACHMENT_COMMAND.keywords?.some((keyword) => keyword.includes(query));
    return onAttach && attachmentMatches ? [ATTACHMENT_COMMAND, ...commands] : commands;
  }, [onAttach, slashQuery]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    if (pendingSelection.current) {
      ta.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      pendingSelection.current = null;
    } else {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [segment]);

  useLayoutEffect(() => {
    if (segment?.kind !== "block") return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft, segment]);

  const scheduleRestoreSelection = () => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta || !pendingSelection.current) return;
      ta.focus();
      ta.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      pendingSelection.current = null;
    });
  };

  const handleDraftChange = (next: string) => {
    setDraft(next);
    if (!segment) return;
    const full = segment.kind === "all" ? next : segment.prefixRaw + next + segment.suffixRaw;
    onChange(full);
  };

  const activateBlock = (index: number) => {
    if (!blockRanges) return;
    const { start, end } = blockRanges[index];
    setSegment({
      kind: "block",
      prefixRaw: value.slice(0, start),
      prefixHtml: renderTokensHtml(tokens.slice(0, index), attachmentUrls),
      suffixRaw: value.slice(end),
      suffixHtml: renderTokensHtml(tokens.slice(index + 1), attachmentUrls),
    });
    setDraft(value.slice(start, end));
  };

  const toggleTaskInBlock = (blockIndex: number, itemIndex: number) => {
    if (!blockRanges) return;
    const { start, end } = blockRanges[blockIndex];
    const nextRaw = toggleNthTaskItem(value.slice(start, end), itemIndex);
    onChange(value.slice(0, start) + nextRaw + value.slice(end));
  };

  const activateAll = (seed?: string) => {
    const initial = seed ?? value;
    setSegment({ kind: "all" });
    setDraft(initial);
    if (seed !== undefined) {
      onChange(initial);
      pendingSelection.current = { start: initial.length, end: initial.length };
    }
  };

  const commit = () => {
    setSegment(null);
    setSlashOpen(false);
    setHelpOpen(false);
    onBlur?.();
  };

  const isRawActive = segment?.kind === "all";

  useImperativeHandle(ref, () => ({
    toggleRaw: () => (isRawActive ? commit() : activateAll()),
  }));

  useEffect(() => {
    onRawChange?.(isRawActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRawActive]);

  const run = (command: Command) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = command.apply(draft, { start: ta.selectionStart, end: ta.selectionEnd });
    handleDraftChange(result.value);
    pendingSelection.current = { start: result.start, end: result.end };
    scheduleRestoreSelection();
  };

  const openHelp = () => {
    const rect = helpBtnRef.current?.getBoundingClientRect();
    if (rect) setHelpPos({ top: rect.bottom + 6, left: rect.left });
    setSlashOpen(false);
    setHelpOpen((o) => !o);
  };

  const updateSlashState = (text: string, caret: number) => {
    const match = matchSlashTrigger(text, caret);
    if (!match) {
      if (slashOpen) setSlashOpen(false);
      return;
    }
    const ta = textareaRef.current;
    if (ta) {
      // Best-effort pixel positioning — if it throws for any reason (unusual font
      // metrics, a hardened WebView, whatever), fall back to anchoring under the
      // textarea itself rather than silently failing to open the menu at all.
      try {
        const coords = getCaretCoordinates(ta, match.start);
        setSlashPos({ top: coords.top + coords.height + 4, left: coords.left });
      } catch (error) {
        console.error("getCaretCoordinates failed, falling back to textarea position", error);
        const rect = ta.getBoundingClientRect();
        setSlashPos({ top: rect.top + 20, left: rect.left });
      }
    }
    setSlashAnchor(match.start);
    setSlashQuery(match.query);
    setSlashHighlight(0);
    setSlashOpen(true);
  };

  /** Closes a menu left open by a caret move (click, arrow key) that walked off the "/". */
  const syncSlashOnCaretMove = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    if (!slashOpen) return;
    const ta = e.currentTarget;
    if (!matchSlashTrigger(ta.value, ta.selectionStart)) setSlashOpen(false);
  };

  const insertSlashCommand = (command: Command) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const withoutSlash = draft.slice(0, slashAnchor) + draft.slice(caret);
    if (command.id === ATTACHMENT_COMMAND.id && onAttach) {
      handleDraftChange(withoutSlash);
      pendingSelection.current = { start: slashAnchor, end: slashAnchor };
      setSlashOpen(false);
      scheduleRestoreSelection();
      onAttach();
      return;
    }
    const result = command.apply(withoutSlash, { start: slashAnchor, end: slashAnchor });
    handleDraftChange(result.value);
    pendingSelection.current = { start: result.start, end: result.end };
    setSlashOpen(false);
    scheduleRestoreSelection();
  };

  const onTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const caret = e.target.selectionStart;
    handleDraftChange(next);
    if (helpOpen) setHelpOpen(false);
    updateSlashState(next, caret);
  };

  const onTextareaPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteImage) return;
    const image = Array.from(e.clipboardData.files).find((file) => file.type.startsWith("image/"))
      ?? Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (!image) return;

    e.preventDefault();
    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    void onPasteImage(image).then((attachment) => {
      const reference = `![${attachment.name}](${attachment.path})`;
      const next = `${draft.slice(0, start)}${reference}${draft.slice(end)}`;
      handleDraftChange(next);
      pendingSelection.current = { start: start + reference.length, end: start + reference.length };
      scheduleRestoreSelection();
    }).catch(() => undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashHighlight((h) => Math.min(h + 1, slashItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const command = slashItems[slashHighlight];
        if (command) insertSlashCommand(command);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSlashOpen(false);
        return;
      }
    }

    if (helpOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setHelpOpen(false);
      return;
    }

    if (e.key === "Escape") {
      e.stopPropagation();
      commit();
      return;
    }

    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const result = continueListOnEnter(draft, { start: ta.selectionStart, end: ta.selectionEnd });
      if (result) {
        e.preventDefault();
        handleDraftChange(result.value);
        pendingSelection.current = { start: result.start, end: result.end };
        scheduleRestoreSelection();
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const fn = e.shiftKey ? outdentLines : indentLines;
      const result = fn(draft, { start: ta.selectionStart, end: ta.selectionEnd });
      handleDraftChange(result.value);
      pendingSelection.current = { start: result.start, end: result.end };
      scheduleRestoreSelection();
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && ta.selectionStart !== ta.selectionEnd && WRAP_ON_TYPE[e.key]) {
      e.preventDefault();
      const [before, after] = WRAP_ON_TYPE[e.key];
      const result = wrapSelection(draft, { start: ta.selectionStart, end: ta.selectionEnd }, before, after);
      handleDraftChange(result.value);
      pendingSelection.current = { start: result.start, end: result.end };
      scheduleRestoreSelection();
      return;
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const command = COMMANDS.find((c) => matchHotkey(c, e));
    if (command) {
      e.preventDefault();
      run(command);
    }
  };

  const shell = (content: ReactNode) => <div className="md-editor-shell">{content}</div>;

  const openAttachmentFromFrozenPreview = (event: ReactMouseEvent<HTMLDivElement>) => {
    const attachmentPath = attachmentPathFromTarget(event.target);
    if (!attachmentPath || !onOpenAttachment) return;
    event.preventDefault();
    onOpenAttachment(attachmentPath);
  };

  if (segment) {
    const surface = (
      <div className={`md-editor${segment.kind === "all" ? " md-editor-all" : ""}`}>
        <div className="md-toolbar" role="toolbar" aria-label="Formatting">
          {COMMANDS.filter((c) => c.toolbar).map((command) => {
            const Icon = command.icon;
            return (
              <button
                key={command.id}
                type="button"
                className="icon-btn"
                title={command.hotkeyLabel ? `${command.label} (${command.hotkeyLabel})` : command.label}
                aria-label={command.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(command)}
              >
                <Icon size={15} />
              </button>
            );
          })}
          <span className="md-toolbar-spacer" />
          {onAttach && (
            <button type="button" className="icon-btn" title="Attach file" aria-label="Attach file" onMouseDown={(e) => e.preventDefault()} onClick={onAttach}>
              <IconImagePlus size={15} />
            </button>
          )}
          <button
            ref={helpBtnRef}
            type="button"
            className="icon-btn"
            title="Markdown syntax reference"
            aria-label="Markdown syntax reference"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openHelp}
          >
            <IconHelp size={15} />
          </button>
          <button type="button" className="icon-btn" title="Done (Esc)" aria-label="Done editing" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
            <IconEye size={15} />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          aria-label={ariaLabel}
          className={`md-textarea${segment.kind === "block" ? " md-textarea-inline" : ""}`}
          value={draft}
          placeholder={placeholder}
          onChange={onTextareaChange}
          onKeyDown={onKeyDown}
          onPaste={onTextareaPaste}
          onSelect={syncSlashOnCaretMove}
          onBlur={commit}
        />
        {slashOpen && (
          <ShorthandMenu anchor={slashPos} items={slashItems} highlight={slashHighlight} onHover={setSlashHighlight} onSelect={insertSlashCommand} label="Insert block" />
        )}
        {helpOpen && (
          <ShorthandMenu
            anchor={helpPos}
            items={COMMANDS}
            highlight={-1}
            onHover={() => {}}
            onSelect={(command) => {
              run(command);
              setHelpOpen(false);
            }}
            label="Markdown syntax reference"
          />
        )}
      </div>
    );

    if (segment.kind === "all") return shell(surface);
    return shell(
      <>
        {segment.prefixHtml && <div className="md-prose md-block-frozen" onClick={openAttachmentFromFrozenPreview} dangerouslySetInnerHTML={{ __html: segment.prefixHtml }} />}
        {surface}
        {segment.suffixHtml && <div className="md-prose md-block-frozen" onClick={openAttachmentFromFrozenPreview} dangerouslySetInnerHTML={{ __html: segment.suffixHtml }} />}
      </>,
    );
  }

  if (isEmpty) {
    return shell(
      <EmptyPlaceholder ariaLabel={ariaLabel} placeholder={placeholder} onActivate={() => activateAll()} onSeed={(seed) => activateAll(seed)} />,
    );
  }

  // marked normalized something in a way that breaks exact position tracking (e.g. CRLF
  // line endings) — fall back to whole-document preview/edit rather than risk corrupting it.
  if (!blockRanges) {
    return shell(
      <BlockPreview
        html={renderTokensHtml(tokens, attachmentUrls)}
        ariaLabel={ariaLabel}
        onActivate={() => activateAll()}
        onToggleTask={(idx) => onChange(toggleNthTaskItem(value, idx))}
        onOpenAttachment={onOpenAttachment}
      />,
    );
  }

  return shell(
    <div className="md-blocks">
      {tokens.map((token, i) =>
        token.type === "space" ? (
          <SpacePreview key={i} raw={token.raw} ariaLabel={ariaLabel} onActivate={() => activateBlock(i)} />
        ) : (
          <BlockPreview
            key={i}
            html={renderTokensHtml([token], attachmentUrls)}
            ariaLabel={ariaLabel}
            onActivate={() => activateBlock(i)}
            onToggleTask={(idx) => toggleTaskInBlock(i, idx)}
            onOpenAttachment={onOpenAttachment}
          />
        ),
      )}
    </div>,
  );
});
