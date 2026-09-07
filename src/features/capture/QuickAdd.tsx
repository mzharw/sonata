import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { DOCUMENT_TYPES, TYPE_SPECS, typeOptions } from "../../lib/documentTypes";
import { TagChipInput } from "../../components/TagChipInput";
import { DueDateField } from "../../components/DueDateField";
import { PrioritySelect } from "../../components/PrioritySelect";
import { IconDropdown } from "../../components/IconDropdown";
import { IconChevronDown, IconChevronUp, IconMaximize, IconPlus } from "../../components/icons";
import { ALL_SHORTHAND_SUGGESTIONS, applyShorthandSuggestion, opensWithTypeKeyword, shorthandSuggestions, type ShorthandSuggestion } from "../../lib/shorthand";
import { CAPTURE_HOTKEY, NEW_NOTE_HOTKEY, hasMod } from "../../lib/hotkeys";
import type { DocumentType, Priority } from "../../types/domain";

const TYPE_OPTIONS = typeOptions(DOCUMENT_TYPES);

export function QuickAdd() {
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
  const [type, setType] = useState<DocumentType>("note");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>();

  const impliedType = sections.find(([view]) => view === ui.view)?.[2];
  const effectiveType = impliedType ?? type;
  const ImpliedIcon = impliedType ? TYPE_SPECS[impliedType].icon : undefined;

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

  const submitShorthand = async () => {
    if (!text.trim()) return;
    try {
      const doc = await native.capture(capturePrefix + text);
      setText("");
      setCaret(0);
      setSuggestOpen(false);
      setShowShorthandReference(false);
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
      const doc = await native.createDocument({ type: effectiveType, title: finalTitle, tags, due: due || undefined, priority, body: "" });
      setText("");
      setCaret(0);
      setTitle("");
      setTags([]);
      setDue("");
      setPriority(undefined);
      setExpanded(false);
      afterCreate(doc.id);
    } catch (error) {
      console.error("Failed to create document", error);
      ui.showToast({ message: "Couldn't add that — see console for details" });
    }
  };

  const openBlankFullEditor = async () => {
    try {
      const doc = await native.createDocument({ type: "note", title: "New note", body: "" });
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
      if (event.key.toLowerCase() !== "n" || !hasMod(event) || event.altKey) return;
      event.preventDefault();
      if (event.shiftKey) void hotkeyActions.current.openBlankFullEditor();
      else hotkeyActions.current.focusCapture();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <IconDropdown
              ariaLabel="Type"
              className="quick-add-type-dropdown"
              value={type}
              options={TYPE_OPTIONS}
              onChange={(v) => setType(v as DocumentType)}
              showLabel={false}
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
              <kbd>Enter</kbd> to add
            </span>
          )}
          {!text.trim() && !focused && (
            <span className="quick-add-hint idle" title={`Jump here from anywhere with ${CAPTURE_HOTKEY}`}>
              <kbd>{CAPTURE_HOTKEY}</kbd>
            </span>
          )}
        </div>
        <button className="icon-btn" aria-label={expanded ? "Collapse add form" : "Expand add form"} title={expanded ? "Collapse add form" : "More fields"} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <IconChevronUp /> : <IconChevronDown />}
        </button>
        <button className="icon-btn" aria-label={`New note in full-screen editor (${NEW_NOTE_HOTKEY})`} title={`New note in full-screen editor (${NEW_NOTE_HOTKEY})`} onClick={() => void openBlankFullEditor()}>
          <IconMaximize />
        </button>
      </div>
      <div className={`quick-add-form-shell${expanded ? " expanded" : ""}`} inert={!expanded}>
        <div className="quick-add-form">
          <div className="form-field">
            <label className="form-field-label" htmlFor="quick-add-title">Title</label>
            <input id="quick-add-title" className="field" placeholder="Defaults to the text above" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-field">
            <span className="form-field-label">Tags</span>
            <TagChipInput value={tags} onChange={setTags} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <span className="form-field-label">Due date</span>
              <DueDateField value={due} onChange={setDue} />
            </div>
            <div className="form-field">
              <span className="form-field-label">Priority</span>
              <PrioritySelect value={priority} onChange={setPriority} />
            </div>
          </div>
          <button className="primary" onClick={() => void submitStructured()}><IconPlus size={14} /> Add</button>
        </div>
      </div>
    </div>
  );
}
