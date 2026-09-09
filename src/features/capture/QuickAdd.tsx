import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { DEFAULT_CAPTURE_TYPE, DEFAULT_FULLSCREEN_TYPE, TYPE_SPECS, type MetaField } from "../../lib/documentTypes";
import { TagChipInput } from "../../components/TagChipInput";
import { DueDateField } from "../../components/DueDateField";
import { PrioritySelect } from "../../components/PrioritySelect";
import { StatusSelect } from "../../components/StatusSelect";
import { StageSelect } from "../../components/StageSelect";
import { UrlField } from "../../components/UrlField";
import { TypeSelect } from "../../components/TypeSelect";
import { detectUrl, normalizeUrl, urlDomain } from "../../lib/url";
import { IconBell, IconChevronDown, IconChevronUp, IconMaximize, IconPlus } from "../../components/icons";
import { ALL_SHORTHAND_SUGGESTIONS, applyShorthandSuggestion, opensWithTypeKeyword, shorthandSuggestions, type ShorthandSuggestion } from "../../lib/shorthand";
import { DEFAULT_PREFERENCES, shortcutLabel, matchesShortcut } from "../../lib/preferences";
import type { DocumentType, IdeaStage, Priority, TaskStatus } from "../../types/domain";

export function QuickAdd({ shortcut = DEFAULT_PREFERENCES.shortcuts.capture, newNoteShortcut = DEFAULT_PREFERENCES.shortcuts.newNote, visible = true }: { shortcut?: string; newNoteShortcut?: string; visible?: boolean }) {
  const ui = useUi();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [showShorthandReference, setShowShorthandReference] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [temporary, setTemporary] = useState(false);
  // Capture lands in the inbox, matching the Rust default, which is what makes the
  // Triage verb on an inbox row mean anything.
  const [type, setType] = useState<DocumentType>(DEFAULT_CAPTURE_TYPE);
  // Set once the user picks a type by hand, so URL detection stops second-guessing them.
  const typeTouched = useRef(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>();
  const [status, setStatus] = useState<TaskStatus>();
  const [reminder, setReminder] = useState("");
  const [stage, setStage] = useState<IdeaStage>();
  const [url, setUrl] = useState("");

  const impliedType = sections.find(([view]) => view === ui.view)?.[2];
  const effectiveType = impliedType ?? type;
  const ImpliedIcon = impliedType ? TYPE_SPECS[impliedType].icon : undefined;
  const spec = TYPE_SPECS[effectiveType];
  const detectedUrl = detectUrl(text);

  const knownTags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  // A leading "task"/"note"/… word stays meaningful whenever the dropdown is what
  // supplies the type, because `capturePrefix` stands down as soon as one is typed.
  // A view-implied type is not overridable that way, so no keyword is offered there.
  const offerTypes = !impliedType;
  const suggestion = useMemo(
    () => shorthandSuggestions(text, caret, knownTags.data ?? [], { offerTypes }),
    [text, caret, knownTags.data, offerTypes],
  );
  const activeSuggestion = showShorthandReference ? { start: caret, items: ALL_SHORTHAND_SUGGESTIONS } : suggestion;
  const suggestions = suggestOpen ? (activeSuggestion?.items ?? []) : [];

  const syncCaret = (target: HTMLInputElement) => setCaret(target.selectionStart ?? target.value.length);

  const acceptSuggestion = (item: ShorthandSuggestion) => {
    if (!activeSuggestion) return;
    const next = applyShorthandSuggestion(text, activeSuggestion.start, caret, item);
    setText(next.text);
    setCaret(next.caret);
    setHighlight(0);
    setShowShorthandReference(false);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.caret, next.caret);
    });
  };

  const afterCreate = (id: string) => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    ui.expand(id);
  };

  // The dropdown supplies a type only until the text names one itself — otherwise
  // "task Buy milk" under the default type would capture as "note task Buy milk"
  // and bury the word "task" in the title. A view-implied type still wins outright.
  const capturePrefix = !impliedType && opensWithTypeKeyword(text) ? "" : TYPE_SPECS[effectiveType].capturePrefix;

  /**
   * A pasted link has no title, and the URL itself is not one. Capture the remaining words
   * through the Rust shorthand parser so `#tag`/`@due:` still work, then attach the URL —
   * guarded on `!doc.bookmark` so this becomes a no-op if `capture_input` ever learns to
   * lift a bare URL itself.
   */
  const submitBookmark = async (link: string) => {
    const rest = text
      .split(/\s+/)
      .filter((word) => word !== link)
      .join(" ")
      .trim();
    const normalized = normalizeUrl(link);
    const doc = await native.capture(`bookmark ${rest || urlDomain(normalized) || "Link"}`);
    if (doc.bookmark) return doc;
    return native.updateDocument({ ...doc, bookmark: { url: normalized } }, doc.contentHash);
  };

  const submitShorthand = async () => {
    if (!text.trim()) return;
    try {
      const doc =
        effectiveType === "bookmark" && detectedUrl
          ? await submitBookmark(detectedUrl)
          : await native.capture(capturePrefix + text);
      setText("");
      setCaret(0);
      setSuggestOpen(false);
      setShowShorthandReference(false);
      if (!visible) setTemporary(false);
      afterCreate(doc.id);
    } catch (error) {
      console.error("Quick capture failed", error);
      ui.showToast({ message: "Couldn't add that — see console for details" });
    }
  };

  const submitStructured = async () => {
    const finalTitle = title.trim() || text.trim();
    if (!finalTitle) return;
    try {
      // Only the fields this type carries are sent, so a due date typed under Task cannot
      // ride along after switching the dropdown to Note. Rust prunes the rest regardless.
      const has = (field: MetaField) => spec.meta.includes(field);
      const doc = await native.createDocument({
        type: effectiveType,
        title: finalTitle,
        tags,
        body: "",
        ...(has("due") && due ? { due } : {}),
        ...(has("priority") && priority ? { priority } : {}),
        ...(has("status") && status ? { status } : {}),
        ...(has("reminder") && reminder ? { reminder } : {}),
        ...(has("stage") && stage ? { stage } : {}),
        ...(has("url") && url.trim() ? { bookmark: { url: normalizeUrl(url) } } : {}),
      });
      setText("");
      setCaret(0);
      setTitle("");
      setTags([]);
      setDue("");
      setPriority(undefined);
      setStatus(undefined);
      setReminder("");
      setStage(undefined);
      setUrl("");
      setExpanded(false);
      if (!visible) setTemporary(false);
      afterCreate(doc.id);
    } catch (error) {
      console.error("Failed to create document", error);
      ui.showToast({ message: "Couldn't add that — see console for details" });
    }
  };

  const openBlankFullEditor = async () => {
    try {
      const doc = await native.createDocument({ type: DEFAULT_FULLSCREEN_TYPE, title: `New ${TYPE_SPECS[DEFAULT_FULLSCREEN_TYPE].label.toLowerCase()}`, body: "" });
      qc.invalidateQueries({ queryKey: ["documents"] });
      ui.openFullScreen(doc.id);
    } catch (error) {
      console.error("Failed to create document", error);
      ui.showToast({ message: "Couldn't create a new note — see console for details" });
    }
  };

  const focusCapture = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    // Re-arm the animation so a second press still reads as a response rather
    // than as nothing happening.
    setFlash(false);
    requestAnimationFrame(() => setFlash(true));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 500);
  };

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Both handlers close over per-render state, so the listener reads them
  // through a ref and registers only once.
  const hotkeyActions = useRef({ focusCapture, openBlankFullEditor });
  hotkeyActions.current = { focusCapture, openBlankFullEditor };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, newNoteShortcut)) {
        event.preventDefault();
        void hotkeyActions.current.openBlankFullEditor();
      } else if (matchesShortcut(event, shortcut) || (shortcut === DEFAULT_PREFERENCES.shortcuts.capture && event.key.toLowerCase() === "n" && event.ctrlKey && !event.shiftKey && !event.altKey)) {
        event.preventDefault();
        if (!visible) {
          setTemporary(true);
          requestAnimationFrame(() => hotkeyActions.current.focusCapture());
        } else hotkeyActions.current.focusCapture();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut, newNoteShortcut, visible]);

  if (!visible && !temporary) return null;

  return (
    <div className="quick-add-wrap" onKeyDown={(e) => { if (e.key === "Escape" && expanded) setExpanded(false); }}>
      <div className="quick-add">
        <div className={`quick-add-input-wrap${flash ? " is-hotkey-flash" : ""}`}>
          {impliedType ? (
            ImpliedIcon && (
              <span className="quick-add-type-icon" aria-hidden="true">
                <ImpliedIcon size={15} />
              </span>
            )
          ) : (
            <TypeSelect
              className="quick-add-type-dropdown"
              value={type}
              onChange={(next) => {
                typeTouched.current = true;
                setType(next);
              }}
              compact
              showChevron
            />
          )}
          <input
            ref={inputRef}
            className="quick-add-input"
            aria-label="Quick add"
            placeholder="Buy milk #errand @due:tomorrow"
            title="Shorthand: [task|note|idea|bookmark] Title #tag @due:date — Ctrl+Space shows all syntax"
            value={text}
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="quick-add-suggestions"
            onChange={(e) => {
              setText(e.target.value);
              syncCaret(e.target);
              setHighlight(0);
              setShowShorthandReference(false);
              setSuggestOpen(true);
              // Pasting a bare link is unambiguous enough to switch the type for, but
              // never over a deliberate pick or a view that already implies one. The text
              // is left alone — the icon flipping to a bookmark is the feedback.
              if (!impliedType && !typeTouched.current && detectUrl(e.target.value)) {
                setType("bookmark");
              }
            }}
            onSelect={(e) => syncCaret(e.currentTarget)}
            onFocus={(e) => {
              syncCaret(e.currentTarget);
              setSuggestOpen(true);
              setFocused(true);
            }}
            onBlur={() => {
              setSuggestOpen(false);
              setShowShorthandReference(false);
              setFocused(false);
            }}
            onKeyDown={(e) => {
              if (e.ctrlKey && !e.altKey && e.code === "Space") {
                e.preventDefault();
                setHighlight(0);
                setShowShorthandReference((visible) => !visible);
                setSuggestOpen(true);
                return;
              }
              if (suggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  // Completing the token comes first — Enter only submits once there is
                  // nothing left to complete, so a half-typed "#err" can't be captured.
                  e.preventDefault();
                  acceptSuggestion(suggestions[highlight] ?? suggestions[0]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setSuggestOpen(false);
                  return;
                }
              }
              if (e.key === "Enter") {
                e.preventDefault();
                void submitShorthand();
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul className="quick-add-suggestions" id="quick-add-suggestions" role="listbox" aria-label="Shorthand suggestions">
              {suggestions.map((item, i) => (
                <li key={item.insert} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    className={i === highlight ? "active" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => acceptSuggestion(item)}
                  >
                    <span>{item.label}</span>
                    {item.hint && <small>{item.hint}</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {text.trim() && suggestions.length === 0 && (
            <span className="quick-add-hint">
              <kbd>Enter</kbd> to {effectiveType === "bookmark" && detectedUrl ? "save link" : "add"}
            </span>
          )}
          {!text.trim() && !focused && (
            <span className="quick-add-hint idle" title={`Jump here with ${shortcutLabel(shortcut)}`}>
              <kbd>{shortcutLabel(shortcut)}</kbd>
            </span>
          )}
        </div>
        <button className="icon-btn" aria-label={expanded ? "Collapse add form" : "Expand add form"} title={expanded ? "Collapse add form" : "More fields"} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <IconChevronUp /> : <IconChevronDown />}
        </button>
        <button className="icon-btn" aria-label={`New note in full-screen editor (${shortcutLabel(newNoteShortcut)})`} title={`New note in full-screen editor (${shortcutLabel(newNoteShortcut)})`} onClick={() => void openBlankFullEditor()}>
          <IconMaximize />
        </button>
      </div>
      <div className={`quick-add-form-shell${expanded ? " expanded" : ""}`} inert={!expanded}>
        <div className="quick-add-form">
          <div className="form-field">
            <label className="form-field-label" htmlFor="quick-add-title">Title</label>
            <input id="quick-add-title" className="field" placeholder="Defaults to the text above" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {(() => {
            // Same exhaustive-map shape as DocumentMetaBar, but wrapped in the form's
            // labelled fields rather than the bare pills.
            const fields: Record<MetaField, { label: string; control: React.ReactNode }> = {
              tags: { label: "Tags", control: <TagChipInput value={tags} onChange={setTags} /> },
              status: { label: "Status", control: <StatusSelect value={status} onChange={setStatus} /> },
              priority: { label: "Priority", control: <PrioritySelect value={priority} onChange={setPriority} /> },
              due: { label: "Due date", control: <DueDateField value={due} onChange={setDue} /> },
              reminder: {
                label: "Reminder",
                control: <DueDateField value={reminder} onChange={setReminder} icon={IconBell} placeholder="No reminder" label="reminder" withTime />,
              },
              stage: { label: "Stage", control: <StageSelect value={stage} onChange={setStage} /> },
              url: { label: "Link", control: <UrlField value={url} onChange={setUrl} /> },
            };
            return spec.meta.map((field) => (
              <div className="form-field" key={field}>
                <span className="form-field-label">{fields[field].label}</span>
                {fields[field].control}
              </div>
            ));
          })()}
          <button className="primary" onClick={() => void submitStructured()}><IconPlus size={14} /> Add</button>
        </div>
      </div>
    </div>
  );
}
