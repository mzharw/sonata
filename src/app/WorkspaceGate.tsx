import { useState, type ComponentType, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../lib/native";
import { Logo } from "../components/Logo";
import { IconFolder, IconMarkdown, IconSearch } from "../components/icons";

/**
 * The first-run screen fills a tall 760x900 panel, so it is a centred column
 * rather than the left-aligned `.empty` block the document list uses.
 */
function Onboard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="onboard">
      <div className="onboard-inner">
        <Logo size={54} className="onboard-mark" />
        <h1>{title}</h1>
        <p className="onboard-sub">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

type Point = { slot: ReactNode; title: string; body: ReactNode };

function OnboardPoints({ points }: { points: Point[] }) {
  return (
    <ul className="onboard-list">
      {points.map((point) => (
        <li key={point.title}>
          <span className="onboard-slot" aria-hidden="true">{point.slot}</span>
          <div>
            <strong>{point.title}</strong>
            <p>{point.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const icon = (Icon: ComponentType<{ size?: number }>) => <Icon size={14} />;

const WORKSPACE_POINTS: Point[] = [
  {
    slot: icon(IconFolder),
    title: "Any folder becomes a workspace",
    body: "Sonata picks up the Markdown already in it and writes new notes alongside them.",
  },
  {
    slot: icon(IconMarkdown),
    title: "Your files stay plain text",
    body: "Every note is a .md file you can read, sync or edit anywhere — with or without Sonata.",
  },
  {
    slot: icon(IconSearch),
    title: "The index is disposable",
    body: "Search and filters run off .sonata/index.db. Delete it any time; your notes are untouched.",
  },
];

const DESKTOP_POINTS: Point[] = [
  {
    slot: "1",
    title: "Start the desktop app",
    body: <>Run <code>npm run dev</code> (or <code>bun dev</code>) from the project root.</>,
  },
  {
    slot: "2",
    title: "Open it from the tray",
    body: <>Choose <em>Open Sonata</em> in the system tray menu.</>,
  },
];

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const desktop = isTauri();
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const [choosing, setChoosing] = useState(false);
  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: () => native.listDocuments(),
    enabled: desktop,
    retry: false,
    staleTime: Infinity,
  });

  if (!desktop) return (
    <Onboard
      title="Open Sonata on your desktop"
      subtitle="Notes and workspace folders come from the native window. This address only serves its frontend."
    >
      <OnboardPoints points={DESKTOP_POINTS} />
    </Onboard>
  );

  const choose = async () => {
    setChoosing(true);
    setError(undefined);
    try {
      const path = await native.chooseWorkspace();
      if (path !== null) await qc.invalidateQueries();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setChoosing(false);
    }
  };

  if (workspace.isPending) return (
    <Onboard title="Welcome to Sonata" subtitle="Opening your workspace…">
      <p className="onboard-loading" role="status">
        <span className="onboard-loading-dot" aria-hidden="true" />
        Reading notes from disk
      </p>
    </Onboard>
  );

  if (!workspace.isSuccess) {
    // "no workspace yet" is the expected first run, not a failure worth
    // repeating back; anything else is a real problem and gets shown.
    const reason = String(workspace.error);
    const firstRun = /choose (or create )?a workspace/i.test(reason);
    return (
      <Onboard
        title="Welcome to Sonata"
        subtitle="Choose a folder to open an existing workspace, or start a new one."
      >
        <OnboardPoints points={WORKSPACE_POINTS} />
        {!firstRun && <p className="onboard-status" role="status">{reason}</p>}
        <button className="primary onboard-cta" disabled={choosing} onClick={() => void choose()}>
          {choosing ? "Opening…" : "Choose workspace…"}
        </button>
        {error
          ? <p className="onboard-alert" role="alert">{error}</p>
          : <p className="onboard-note">Nothing leaves this machine. Sonata only reads the folder you pick.</p>}
      </Onboard>
    );
  }

  return children;
}
