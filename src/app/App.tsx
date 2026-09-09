import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUi } from "../stores/ui";
import { ViewMenu } from "../features/tags/ViewMenu";
import { FilterMenu } from "../features/filters/FilterMenu";
import { QuickAdd } from "../features/capture/QuickAdd";
import { TagChipsBar } from "../features/tags/TagChipsBar";
import { DocumentList } from "../features/editor/DocumentList";
import { FullScreenEditor } from "../features/editor/FullScreenEditor";
import { CommandPalette } from "../features/palette/CommandPalette";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Toast } from "../components/Toast";
import { IconSearch } from "../components/icons";
import { IconSettings } from "../components/icons";
import { SettingsPanel } from "../components/SettingsPanel";
import { Logo } from "../components/Logo";
import { PALETTE_HOTKEY, SEARCH_HOTKEY } from "../lib/hotkeys";
import { native } from "../lib/native";
import { sections } from "../features/search/views";

function LockScreen({ unlock }: { unlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  return <main className="lock-screen"><form onSubmit={(event) => { event.preventDefault(); void native.verifyWorkspaceLock(password).then((ok) => ok ? unlock() : setError("Incorrect password")).catch((cause) => setError(String(cause))); }}><Logo size={44} /><h1>Sonata is locked</h1><input autoFocus aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary">Unlock</button>{error && <p role="alert">{error}</p>}</form></main>;
}

function NavigationContextMenu() {
  const ui = useUi();
  const menu = ui.contextMenu;
  if (menu?.kind !== "navigation") return null;

  // Keep the menu within the window even when the pointer is close to an edge.
  const left = Math.min(menu.x, window.innerWidth - 196);
  const top = Math.min(menu.y, window.innerHeight - 270);
  return (
    <div className="navigation-context-menu" role="menu" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }} style={{ left: Math.max(8, left), top: Math.max(8, top) }}>
      <p className="eyebrow">GO TO</p>
      {sections.filter(([view]) => view !== "tag").map(([view, label]) => (
        <button
          key={view}
          role="menuitem"
          type="button"
          className={ui.view === view ? "active" : undefined}
          onClick={() => { ui.setView(view); ui.closeContextMenu(); }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const ui = useUi();
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [locked, setLocked] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const lock = useQuery({ queryKey: ["workspace-lock"], queryFn: native.workspaceLockStatus, retry: false });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setPalette(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ui]);

  useEffect(() => {
    if (lock.data?.enabled) setLocked(true);
  }, [lock.data?.enabled]);
  useEffect(() => {
    if (locked || !lock.data?.enabled) return;
    let timer = 0;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setLocked(true), lock.data!.timeoutMinutes * 60_000); };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, reset));
    reset();
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [locked, lock.data]);
  useEffect(() => {
    if (!ui.contextMenu) return;
    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[role="menu"]')) ui.closeContextMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") ui.closeContextMenu();
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [ui, ui.contextMenu]);

  if (lock.isPending) return <main className="lock-screen" />;
  if (locked) return <LockScreen unlock={() => setLocked(false)} />;

  if (ui.fullScreenId) return <FullScreenEditor id={ui.fullScreenId} />;

  return (
    <main
      className="shell"
      onContextMenu={(event) => {
        event.preventDefault();
        ui.openContextMenu({ kind: "navigation", x: event.clientX, y: event.clientY });
      }}
    >
      <header className="topbar">
        <Logo className="mark" />
        <span className="topbar-divider" aria-hidden="true" />
        <div className="search">
          <IconSearch size={14} />
          <input ref={searchRef} aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          <kbd className="search-focus-hotkey" title="Focus search">{SEARCH_HOTKEY}</kbd>
          <button type="button" className="search-hotkey" aria-label="Open command palette" title={`Open command palette (${PALETTE_HOTKEY})`} onClick={() => ui.setPalette(true)}>
            <kbd>{PALETTE_HOTKEY}</kbd>
          </button>
        </div>
        <ViewMenu />
        <FilterMenu />
        <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => setSettings(true)}><IconSettings size={15} /></button>
      </header>
      <TagChipsBar />
      <DocumentList search={search} />
      <QuickAdd />
      <NavigationContextMenu />
      {ui.palette && <CommandPalette close={() => ui.setPalette(false)} />}
      {ui.confirm && <ConfirmDialog request={ui.confirm} onCancel={ui.clearConfirm} />}
      {ui.toast && <Toast toast={ui.toast} onDismiss={ui.clearToast} />}
      {settings && <SettingsPanel close={() => setSettings(false)} onLock={() => setLocked(true)} />}
    </main>
  );
}
