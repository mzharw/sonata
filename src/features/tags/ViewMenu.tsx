import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { TYPE_SPECS } from "../../lib/documentTypes";
import { IconArchive, IconChevronDown, IconChevronUp, IconCommand, IconListBullets, IconRefresh } from "../../components/icons";

const LIBRARY_SHORTCUTS = new Map([
  ["a", "all"],
  ["i", "inbox"],
  ["t", "tasks"],
  ["n", "notes"],
  ["d", "ideas"],
  ["b", "bookmarks"],
  ["r", "archive"],
]);

export function ViewMenu() {
  const ui = useUi();
  const qc = useQueryClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const [open, setOpen] = useState(false);
  const [awaitingLibraryShortcut, setAwaitingLibraryShortcut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shortcutTimeoutRef = useRef<number | undefined>(undefined);
  // Tags filter the current library view; they are not themselves the name of this
  // compact top-bar control. Retaining the last library label also prevents a long tag
  // from widening the header.
  const lastLibraryView = useRef(ui.view === "tag" ? "all" : ui.view);
  if (ui.view !== "tag") lastLibraryView.current = ui.view;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const clearShortcut = () => {
      if (shortcutTimeoutRef.current !== undefined) window.clearTimeout(shortcutTimeoutRef.current);
      shortcutTimeoutRef.current = undefined;
      setAwaitingLibraryShortcut(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || editableTarget(event.target)) return;
      if (awaitingLibraryShortcut) {
        event.preventDefault();
        if (event.key === "Escape") {
          setOpen(false);
          clearShortcut();
          return;
        }
        const view = LIBRARY_SHORTCUTS.get(event.key.toLowerCase());
        if (view) {
          ui.setView(view as Parameters<typeof ui.setView>[0]);
          setOpen(false);
        }
        clearShortcut();
        return;
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        setAwaitingLibraryShortcut(true);
        shortcutTimeoutRef.current = window.setTimeout(clearShortcut, 1800);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [awaitingLibraryShortcut, ui]);

  useEffect(() => () => {
    if (shortcutTimeoutRef.current !== undefined) window.clearTimeout(shortcutTimeoutRef.current);
  }, []);

  const activeLibrary = sections.find(([view]) => view === lastLibraryView.current);
  const label = activeLibrary?.[1] ?? "Library";
  const ActiveIcon = activeLibrary?.[2] ? TYPE_SPECS[activeLibrary[2]].icon : lastLibraryView.current === "archive" ? IconArchive : IconListBullets;

  return (
    <div className="view-menu" ref={containerRef}>
      <button ref={triggerRef} className="view-menu-trigger" aria-label={`Open ${label} library`} title={`${label} — Alt+Shift+K`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ActiveIcon size={16} /> {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </button>
      {open && (
        <div className="view-menu-popover" role="menu">
          <p className="eyebrow">LIBRARY</p>
          {awaitingLibraryShortcut && <p className="view-menu-shortcut-hint" role="status">Press A, I, T, N, D, B, or R</p>}
          <nav>
            {/* The status views live in the filter menu now; the command palette
                still lists every one of them by name. */}
            {sections.filter(([, , , group]) => group !== "status").map(([view, viewLabel]) => (
              <button key={view} className={ui.view === view ? "active" : ""} onClick={() => { ui.setView(view); setOpen(false); }}>
                <span>{viewLabel}</span>{[...LIBRARY_SHORTCUTS.entries()].find(([, target]) => target === view)?.[0].toUpperCase() && <kbd>{[...LIBRARY_SHORTCUTS.entries()].find(([, target]) => target === view)![0].toUpperCase()}</kbd>}
              </button>
            ))}
          </nav>
          <p className="eyebrow">TAGS</p>
          <div className="tags">
            {tags.data?.map(({ tag, count }) => (
              <button key={tag} className={ui.view === "tag" && ui.tag === tag ? "active" : ""} onClick={() => { ui.setView("tag", tag); setOpen(false); }}>
                <span># {tag}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>
          <footer>
            <button onClick={() => { ui.setPalette(true); setOpen(false); }}><IconCommand size={14} /> Command palette</button>
            <button onClick={() => void native.rebuild().then(() => qc.invalidateQueries())}><IconRefresh size={14} /> Rebuild index</button>
          </footer>
        </div>
      )}
    </div>
  );
}
