import { useEffect, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi, activeFilterCount } from "../../stores/ui";
import { queryFor } from "../search/views";
import { useListKeyboardNav } from "../../hooks/useListKeyboardNav";
import { DocumentRow } from "./DocumentRow";
import type { DocumentSummary, TaskStatus } from "../../types/domain";
import { documentAttention, type DocumentAttention } from "../../lib/attention";
import { IconBell } from "../../components/icons";

async function toggleComplete(doc: DocumentSummary, qc: QueryClient) {
  const full = await native.readDocument(doc.id);
  const status: TaskStatus = doc.status === "completed" ? "todo" : "completed";
  await native.updateDocument({ ...full, status }, full.contentHash);
  qc.invalidateQueries({ queryKey: ["documents"] });
}

async function togglePinned(doc: DocumentSummary, qc: QueryClient) {
  const full = await native.readDocument(doc.id);
  await native.updateDocument({ ...full, pinned: !doc.pinned }, full.contentHash);
  qc.invalidateQueries({ queryKey: ["documents"] });
}

async function updateStatus(doc: DocumentSummary, status: TaskStatus | undefined, qc: QueryClient) {
  const full = await native.readDocument(doc.id);
  await native.updateDocument({ ...full, status }, full.contentHash);
  qc.invalidateQueries({ queryKey: ["documents"] });
}

export function DocumentList({ search }: { search: string }) {
  const ui = useUi();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const { filters } = ui;
  const docs = useQuery({
    queryKey: ["documents", ui.view, ui.tag, search, filters],
    queryFn: () =>
      native.listDocuments({
        ...queryFor(ui.view, ui.tag),
        text: search || undefined,
        // The chosen filters refine the view rather than the other way round, so
        // they are spread last — picking "Todo" inside Completed shows todos.
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.tags?.length ? { tags: filters.tags } : {}),
        sort: filters.sort,
      }),
  });
  const ids = docs.data?.map((d) => d.id) ?? [];
  const { activeId, clear: clearActive, containerProps } = useListKeyboardNav(ids);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const attention = (docs.data ?? []).flatMap((doc) => {
    const state = documentAttention(doc, now);
    return state ? [{ doc, state }] : [];
  });

  const acknowledge = (doc: DocumentSummary, state: DocumentAttention) => {
    void native.acknowledgeDocumentAttention(doc.id, state.due, state.reminder)
      .then(() => qc.invalidateQueries({ queryKey: ["documents"] }))
      .catch((error: unknown) => console.error("Couldn't acknowledge document attention", doc.id, error));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    // A child control that owns Escape (a dropdown, picker, or editor surface) marks the
    // event handled. The list is the final escape hatch, never the first responder.
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      // Escape unwinds one layer at a time: close the open row first, then drop
      // the selection so the list can sit with no row singled out.
      if (ui.expandedId) {
        event.preventDefault();
        ui.expand(undefined);
        return;
      }
      if (activeId) {
        event.preventDefault();
        clearActive();
        return;
      }
    }
    // A row is open for editing — its own fields (tag input, textarea, dropdowns) own
    // the keyboard now, so list-level shortcuts (arrow nav, Enter-to-expand) must stand
    // down or they'd hijack typing (e.g. swallow Enter meant to add a tag or a newline).
    if (ui.expandedId) return;
    containerProps.onKeyDown(event);
    const doc = docs.data?.find((d) => d.id === activeId);
    if (!doc) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void toggleComplete(doc, qc);
    } else if (event.key === "Enter") {
      event.preventDefault();
      ui.expand(ui.expandedId === doc.id ? undefined : doc.id);
    }
  };

  if (docs.isError) {
    return (
      <div className="empty">
        <p>Open or create a workspace using the desktop command API.</p>
        <button className="primary" onClick={() => void native.chooseWorkspace().then(() => qc.invalidateQueries())}>Choose workspace…</button>
      </div>
    );
  }

  return (
    <section className="document-list-shell" aria-label="Documents">
      {attention.length > 0 && (
        <div className="attention-strip" role="region" aria-label="Needs attention">
          <span className="attention-strip-icon" aria-hidden="true"><IconBell size={15} /></span>
          <div className="attention-strip-items">
            {attention.map(({ doc, state }) => (
              <button key={doc.id} type="button" onClick={() => { acknowledge(doc, state); ui.expand(doc.id); }}>
                <b>{doc.title || "Untitled"}</b><span>{state.labels.join(" · ")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <ul
      className="document-list"
      {...containerProps}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Focus leaving the list entirely (not just moving into an expanded
        // row's fields) means nothing is being navigated any more.
        if (!event.currentTarget.contains(event.relatedTarget)) clearActive();
      }}
    >
      {docs.data?.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} isActive={doc.id === activeId} attention={documentAttention(doc, now)} onAcknowledge={acknowledge} onToggleComplete={(d) => void toggleComplete(d, qc)} onTogglePin={(d) => void togglePinned(d, qc)} onUpdateStatus={(d, status) => void updateStatus(d, status, qc)} />
      ))}
      {docs.data?.length === 0 &&
        (activeFilterCount(filters) > 0 ? (
          // Distinguish "you filtered everything out" from "this view is empty",
          // otherwise an active filter reads as missing data.
          <div className="empty">
            <p>No items match the current filters.</p>
            <button className="primary" onClick={() => ui.resetFilters()}>Clear filters</button>
          </div>
        ) : (
          <div className="empty">Nothing here yet. Capture a thought, or make a new item.</div>
        ))}
      </ul>
    </section>
  );
}
