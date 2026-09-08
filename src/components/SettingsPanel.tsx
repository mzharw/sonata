import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { native } from "../lib/native";

/** Workspace-focused settings deliberately expose only operations Sonata can perform safely. */
export function SettingsPanel({ close }: { close: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"workspace" | "index">();
  const [message, setMessage] = useState<string>();
  const run = async (kind: "workspace" | "index", action: () => Promise<unknown>) => {
    setBusy(kind); setMessage(undefined);
    try { await action(); await qc.invalidateQueries(); setMessage(kind === "workspace" ? "Workspace opened" : "Search index rebuilt"); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(undefined); }
  };
  return <div className="settings-backdrop" role="presentation" onMouseDown={close}>
    <section className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>Settings</h2><button className="icon-btn" aria-label="Close settings" onClick={close}>×</button></header>
      <h3>Workspace</h3>
      <p>Sonata reads and writes only the folder you choose. Markdown remains the source of truth.</p>
      <button className="primary" disabled={busy !== undefined} onClick={() => void run("workspace", native.chooseWorkspace)}>Choose workspace…</button>
      <button disabled={busy !== undefined} onClick={() => void run("index", native.rebuild)}>Rebuild search index</button>
      {message && <p role="status" className="settings-status">{message}</p>}
    </section>
  </div>;
}
