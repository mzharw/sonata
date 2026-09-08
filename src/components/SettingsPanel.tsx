import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../lib/native";

/** Workspace-focused settings deliberately expose only operations Sonata can perform safely. */
export function SettingsPanel({ close, onLock }: { close: () => void; onLock: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"workspace" | "index">();
  const [message, setMessage] = useState<string>();
  const [password, setPassword] = useState("");
  const [timeout, setTimeoutMinutes] = useState(15);
  const lock = useQuery({ queryKey: ["workspace-lock"], queryFn: native.workspaceLockStatus });
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
      <h3>Session lock</h3>
      <p>Locks Sonata after inactivity. This protects the app session; Markdown files remain unencrypted and portable.</p>
      <input aria-label="Lock password" type="password" value={password} placeholder={lock.data?.enabled ? "New password, or blank to disable" : "Set a password"} onChange={(event) => setPassword(event.target.value)} />
      <label className="settings-timeout">Lock after <input aria-label="Lock timeout minutes" type="number" min="1" max="240" value={timeout} onChange={(event) => setTimeoutMinutes(Number(event.target.value))} /> minutes</label>
      <button disabled={busy !== undefined} onClick={() => void run("index", async () => { await native.configureWorkspaceLock(password, timeout); await qc.invalidateQueries({ queryKey: ["workspace-lock"] }); setPassword(""); })}>{lock.data?.enabled ? "Save lock settings" : "Enable lock"}</button>
      {lock.data?.enabled && <button onClick={() => { onLock(); close(); }}>Lock now</button>}
      {message && <p role="status" className="settings-status">{message}</p>}
    </section>
  </div>;
}
