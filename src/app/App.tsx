import { useEffect, useState } from "react";
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
import { Logo } from "../components/Logo";
import { PALETTE_HOTKEY } from "../lib/hotkeys";

export default function App() {
  const ui = useUi();
  const [search, setSearch] = useState("");

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
      </header>
      <TagChipsBar />
      <DocumentList search={search} />
      <QuickAdd />
      {ui.palette && <CommandPalette close={() => ui.setPalette(false)} />}
      {ui.confirm && <ConfirmDialog request={ui.confirm} onCancel={ui.clearConfirm} />}
      {ui.toast && <Toast toast={ui.toast} onDismiss={ui.clearToast} />}
    </main>
  );
}
