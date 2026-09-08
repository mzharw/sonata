import { useEffect, useState } from "react";
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
import { PALETTE_HOTKEY } from "../lib/hotkeys";
import { native } from "../lib/native";

function LockScreen({ unlock }: { unlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  return <main className="lock-screen"><form onSubmit={(event) => { event.preventDefault(); void native.verifyWorkspaceLock(password).then((ok) => ok ? unlock() : setError("Incorrect password")).catch((cause) => setError(String(cause))); }}><Logo size={44} /><h1>Sonata is locked</h1><input autoFocus aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary">Unlock</button>{error && <p role="alert">{error}</p>}</form></main>;
}

export default function App() {
  const ui = useUi();
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [locked, setLocked] = useState(false);
  const lock = useQuery({ queryKey: ["workspace-lock"], queryFn: native.workspaceLockStatus, retry: false });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "k") {
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

  if (lock.isPending) return <main className="lock-screen" />;
  if (locked) return <LockScreen unlock={() => setLocked(false)} />;

  if (ui.fullScreenId) return <FullScreenEditor id={ui.fullScreenId} />;

  return (
    <main className="shell">
      <header className="topbar">
        <Logo className="mark" />
        <span className="topbar-divider" aria-hidden="true" />
        <div className="search">
          <IconSearch size={14} />
          <input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          <button type="button" className="search-hotkey" title="Open command palette" onClick={() => ui.setPalette(true)}>
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
      {ui.palette && <CommandPalette close={() => ui.setPalette(false)} />}
      {ui.confirm && <ConfirmDialog request={ui.confirm} onCancel={ui.clearConfirm} />}
      {ui.toast && <Toast toast={ui.toast} onDismiss={ui.clearToast} />}
      {settings && <SettingsPanel close={() => setSettings(false)} onLock={() => setLocked(true)} />}
    </main>
  );
}
