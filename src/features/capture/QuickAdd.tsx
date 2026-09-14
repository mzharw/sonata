import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { DEFAULT_CAPTURE_TYPE, DEFAULT_FULLSCREEN_TYPE, DOCUMENT_TYPES, TYPE_SPECS } from "../../lib/documentTypes";
import { TypeSelect } from "../../components/TypeSelect";
import { detectUrl, normalizeUrl, urlDomain } from "../../lib/url";
import { IconFullScreenEdit } from "../../components/icons";
import { ALL_SHORTHAND_SUGGESTIONS, applyShorthandSuggestion, opensWithTypeKeyword, shorthandSuggestions, type ShorthandSuggestion } from "../../lib/shorthand";
import { DEFAULT_PREFERENCES, shortcutLabel, matchesShortcut } from "../../lib/preferences";
import type { DocumentType } from "../../types/domain";

const resizeInput = (target: HTMLTextAreaElement) => {
  // A textarea can retain the previous content's scroll height after it is
  // cleared. The empty capture must always return to its compact baseline.
  if (!target.value) {
    target.style.height = "32px";
    target.style.overflowY = "hidden";
    return;
  }
  target.style.height = "auto";
  const contentHeight = target.scrollHeight;
  target.style.height = `${Math.max(32, Math.min(contentHeight, 160))}px`;
  // Avoid a distracting scrollbar while the field can still grow. It becomes
  // available only after the capped height can no longer hold the content.
  target.style.overflowY = contentHeight > 160 ? "auto" : "hidden";
};

export function QuickAdd({ shortcut = DEFAULT_PREFERENCES.shortcuts.capture, newNoteShortcut = DEFAULT_PREFERENCES.shortcuts.newNote, visible = true }: { shortcut?: string; newNoteShortcut?: string; visible?: boolean }) {
  const ui = useUi();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [captureFocused, setCaptureFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [showShorthandReference, setShowShorthandReference] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [temporary, setTemporary] = useState(false);
  // Capture lands in the inbox, matching the Rust default, which is what makes the
  // Triage verb on an inbox row mean anything.
  const [type, setType] = useState<DocumentType>(DEFAULT_CAPTURE_TYPE);
  // Set once the user picks a type by hand, so URL detection stops second-guessing them.
  const typeTouched = useRef(false);

  const impliedType = sections.find(([view]) => view === ui.view)?.[2];
  // A complete leading shorthand keyword is already the source of truth for capture. Mirror
  // it in the picker too, so typing `task`, `note`, or the `todo` task alias gives immediate
  // visual feedback without overwriting the user's previous manual picker choice.
  const shorthandType = useMemo(() => {
    const keyword = text.trimStart().split(/\s+/, 1)[0]?.toLowerCase();
    return DOCUMENT_TYPES.find((candidate) => keyword && TYPE_SPECS[candidate].keywords.includes(keyword));
  }, [text]);
  const effectiveType = impliedType ?? shorthandType ?? type;
  const ImpliedIcon = impliedType ? TYPE_SPECS[impliedType].icon : undefined;
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

  const syncCaret = (target: HTMLTextAreaElement) => setCaret(target.selectionStart ?? target.value.length);
  // Use the exact same measurement for an empty capture as for typed text.
  // `useLayoutEffect` applies it before the textarea is painted, preventing its
  // browser-default height from flashing until the first keystroke resizes it.
  useLayoutEffect(() => {
    if (inputRef.current) resizeInput(inputRef.current);
  }, []);
  // Submission clears React state without an input event, so reset the DOM
  // height here as well instead of leaving the last expanded measurement.
  useLayoutEffect(() => {
    if (!text && inputRef.current) resizeInput(inputRef.current);
  }, [text]);

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

  const openBlankFullEditor = async () => {
    try {
      const doc = await native.createDocument({ type: DEFAULT_FULLSCREEN_TYPE, title: `New ${TYPE_SPECS[DEFAULT_FULLSCREEN_TYPE].label.toLowerCase()}`, body: "" });
      qc.invalidateQueries({ queryKey: ["documents"] });
      ui.openFullScreen(doc.id, true);
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
    <div className="quick-add-wrap">
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
              value={shorthandType ?? type}
              onChange={(next) => {
                typeTouched.current = true;
                setType(next);
              }}
              ariaLabel={`Type: ${TYPE_SPECS[shorthandType ?? type].label}`}
              compact
              showChevron
              />
          )}
          {!text && <span className={`quick-add-placeholder-hint${captureFocused ? " is-focused" : ""}`} aria-hidden="true">[task|note|idea|bookmark] Title #tag @due:date</span>}
          <textarea
            rows={1}
            ref={inputRef}
            className={`quick-add-input${!text ? " has-placeholder-hint" : ""}`}
            aria-label="Quick add"
            placeholder="[task|note|idea|bookmark] Title #tag @due:date"
            value={text}
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="quick-add-suggestions"
            onChange={(e) => {
              setText(e.target.value);
              resizeInput(e.currentTarget);
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
              setCaptureFocused(true);
              syncCaret(e.currentTarget);
              setSuggestOpen(true);
            }}
            onBlur={() => {
              setCaptureFocused(false);
              setSuggestOpen(false);
              setShowShorthandReference(false);
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
              // Shift+Enter is the textarea's newline shortcut. Keep it out of
              // the capture path even when the shorthand has no `::` body yet.
              if (e.key === "Enter" && !e.shiftKey && ((e.ctrlKey || e.metaKey) || !text.includes("::"))) {
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
              <kbd>{text.includes("::") ? "Ctrl+Enter" : "Enter"}</kbd> to {effectiveType === "bookmark" && detectedUrl ? "save link" : "add"}
            </span>
          )}
        </div>
        <button className="icon-btn" aria-label={`New note in full-screen editor (${shortcutLabel(newNoteShortcut)})`} title={`New note in full-screen editor (${shortcutLabel(newNoteShortcut)})`} onClick={() => void openBlankFullEditor()}>
          <IconFullScreenEdit />
        </button>
      </div>
      <div className={`quick-add-bottom-hint quick-add-hint idle${text.trim() ? " is-hidden" : ""}`} aria-hidden={Boolean(text.trim())}>
        {captureFocused ? <span><kbd>Ctrl+Space</kbd><span className="quick-add-hint-label">for all syntax</span></span> : <span><kbd>{shortcutLabel(shortcut)}</kbd><span className="quick-add-hint-label">to focus</span></span>}
      </div>
    </div>
  );
}
