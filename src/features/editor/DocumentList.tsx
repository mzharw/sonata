import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi, activeFilterCount } from "../../stores/ui";
import { queryFor } from "../search/views";
import { useListKeyboardNav } from "../../hooks/useListKeyboardNav";
import { DocumentRow } from "./DocumentRow";
import type { DocumentSummary, TaskStatus } from "../../types/domain";
import { documentAttention, type DocumentAttention } from "../../lib/attention";
import { IconArchive, IconBell, IconTrash, IconX } from "../../components/icons";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string>();
  const [shiftSelecting, setShiftSelecting] = useState(false);
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [dragPreview, setDragPreview] = useState<{ title: string; x: number; y: number }>();
  const [suppressActivation, setSuppressActivation] = useState(false);
  const [selectAllPending, setSelectAllPending] = useState(false);
  const pointerDrag = useRef<{ id: string; startY: number; active: boolean; order: DocumentSummary[]; targetId?: string; previewFrame?: number; x: number; y: number } | undefined>(undefined);
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
  const ids = useMemo(() => docs.data?.map((d) => d.id) ?? [], [docs.data]);
  const { activeId, clear: clearActive, containerProps } = useListKeyboardNav(ids);
  const selectedDocs = (docs.data ?? []).filter((doc) => selectedIds.has(doc.id));
  const selectionMode = selectedIds.size > 0;
  // A drag acts on the complete default list. Reordering a search or a filtered subset would
  // give it an ambiguous place among the hidden rows, so those views remain read-only.
  const canReorder = ui.view === "all" && !search && activeFilterCount(filters) === 0 && filters.sort === "default" && !selectionMode && !ui.expandedId;

  const requestSelectAll = () => {
    if (docs.data) setSelectedIds(new Set(ids));
    else setSelectAllPending(true);
  };

  const reorder = (sourceId: string, targetId: string, current: DocumentSummary[]) => {
    if (sourceId === targetId) return current;
    const next = [...current];
    const from = next.findIndex((doc) => doc.id === sourceId);
    const to = next.findIndex((doc) => doc.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    qc.setQueryData(["documents", ui.view, ui.tag, search, filters], next);
    return next;
  };

  const saveReorder = (order: DocumentSummary[]) => {
    void native.reorderDocuments(order.map((doc) => doc.id))
      .then(() => qc.invalidateQueries({ queryKey: ["documents"] }))
      .catch((error: unknown) => {
        console.error("Couldn't reorder documents", error);
        ui.showToast({ message: "Couldn't save the new order — it has been restored" });
        qc.invalidateQueries({ queryKey: ["documents"] });
      });
  };

  const onReorderPointerDown = (doc: DocumentSummary, event: PointerEvent<HTMLLIElement>) => {
    if (!(event.target as Element).closest(".doc-drag-handle")) return;
    if ((event.target as Element).closest("button, input, textarea, select, a")) return;
    pointerDrag.current = { id: doc.id, startY: event.clientY, active: false, order: docs.data ?? [], x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onReorderPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    const drag = pointerDrag.current;
    if (!drag) return;
    drag.x = Number.isFinite(event.clientX) ? event.clientX : 0;
    drag.y = Number.isFinite(event.clientY) ? event.clientY : 0;
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < 6) return;
      drag.active = true;
      setDraggedId(drag.id);
      const title = drag.order.find((doc) => doc.id === drag.id)?.title || "Untitled";
      setDragPreview({ title, x: drag.x, y: drag.y });
    }
    event.preventDefault();
    if (drag.previewFrame === undefined) {
      drag.previewFrame = window.requestAnimationFrame(() => {
        drag.previewFrame = undefined;
        setDragPreview((preview) => preview && { ...preview, x: drag.x, y: drag.y });
      });
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-document-id]");
    const targetId = target?.dataset.documentId;
    if (!targetId || targetId === drag.id) return;
    if (targetId === drag.targetId) return;
    drag.targetId = targetId;
    setDropTargetId(targetId);
    const next = reorder(drag.id, targetId, drag.order);
    if (next) drag.order = next;
  };

  const onReorderPointerUp = (event: PointerEvent<HTMLLIElement>) => {
    const drag = pointerDrag.current;
    if (!drag) return;
    if (drag.previewFrame !== undefined) window.cancelAnimationFrame(drag.previewFrame);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    pointerDrag.current = undefined;
    setDraggedId(undefined);
    setDropTargetId(undefined);
    setDragPreview(undefined);
    if (!drag.active) return;
    setSuppressActivation(true);
    window.setTimeout(() => setSuppressActivation(false), 0);
    saveReorder(drag.order);
  };

  const selectForBulk = (id: string) => {
    setSelectedIds((current) => new Set(current).add(id));
    setSelectionAnchorId(id);
    ui.closeContextMenu();
  };

  const toggleBulkSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectionAnchorId(id);
  };

  const selectRangeForBulk = (id: string) => {
    const anchor = selectionAnchorId ?? selectedDocs[0]?.id;
    if (!anchor || !docs.data) {
      selectForBulk(id);
      return;
    }
    const start = docs.data.findIndex((doc) => doc.id === anchor);
    const end = docs.data.findIndex((doc) => doc.id === id);
    if (start < 0 || end < 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      docs.data!.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((doc) => next.add(doc.id));
      return next;
    });
  };

  const clearBulkSelection = () => {
    setSelectedIds(new Set());
    setSelectionAnchorId(undefined);
  };

  const runBulk = (successLabel: string, actionLabel: string, action: (id: string) => Promise<void>, undo?: { label: string; action: (id: string) => Promise<void> }) => {
    const idsToChange = selectedDocs.map((doc) => doc.id);
    void Promise.all(idsToChange.map(action))
      .then(() => {
        clearBulkSelection();
        qc.invalidateQueries({ queryKey: ["documents"] });
        ui.showToast({
          message: `${successLabel} ${idsToChange.length} ${idsToChange.length === 1 ? "document" : "documents"}`,
          onUndo: undo ? () => {
            void Promise.all(idsToChange.map(undo.action))
              .then(() => {
                qc.invalidateQueries({ queryKey: ["documents"] });
                ui.showToast({ message: `${undo.label} ${idsToChange.length} ${idsToChange.length === 1 ? "document" : "documents"}` });
              })
              .catch((error: unknown) => {
                console.error(`Couldn't undo ${actionLabel}`, error);
                ui.showToast({ message: `Couldn't undo ${actionLabel} for every selected document — see console for details` });
              });
          } : undefined,
        });
      })
      .catch((error: unknown) => {
        console.error(`Couldn't ${actionLabel} selected documents`, error);
        ui.showToast({ message: `Couldn't ${actionLabel} every selected document — see console for details` });
      });
  };

  const archiveSelected = () => {
    const restore = selectedDocs.every((doc) => doc.archived);
    runBulk(
      restore ? "Restored" : "Archived",
      restore ? "restore" : "archive",
      restore ? native.unarchive : native.archive,
      { label: restore ? "Archived" : "Restored", action: restore ? native.archive : native.unarchive },
    );
  };

  const requestTrashSelected = () => {
    ui.requestConfirm({ message: `Move ${selectedDocs.length} selected ${selectedDocs.length === 1 ? "document" : "documents"} to trash?`, confirmLabel: "Move to trash", onConfirm: () => runBulk("Moved to trash", "move to trash", native.trash, { label: "Restored", action: native.restoreFromTrash }) });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const clearShiftSelection = () => {
      delete document.documentElement.dataset.shiftSelection;
      setShiftSelecting(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift" && !editableTarget(event.target) && !editableTarget(document.activeElement)) {
        document.documentElement.dataset.shiftSelection = "true";
        setShiftSelecting(true);
      }
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift") clearShiftSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearShiftSelection);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearShiftSelection);
      clearShiftSelection();
    };
  }, []);

  useEffect(() => {
    // A filter or another action can remove a selected row from this view.
    // Keep only rows that still exist, rather than leaving a hidden selection behind.
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => ids.includes(id)));
      return next.size === current.size ? current : next;
    });
  }, [ids]);

  useEffect(() => {
    if (selectionMode && ui.expandedId) ui.expand(undefined);
  }, [selectionMode, ui, ui.expandedId]);

  useEffect(() => {
    if (!selectAllPending || !docs.data) return;
    setSelectedIds(new Set(ids));
    setSelectAllPending(false);
  }, [docs.data, ids, selectAllPending]);

  useEffect(() => {
    const editableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || editableTarget(event.target)) return;
      if (selectionMode && event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        archiveSelected();
        return;
      }
      if (selectionMode && event.key === "Delete") {
        event.preventDefault();
        requestTrashSelected();
        return;
      }
      if (event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        requestSelectAll();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [docs.data, ids, selectionMode, selectedDocs, ui]);

  useEffect(() => {
    if (draggedId) document.documentElement.dataset.listDragging = "true";
    else delete document.documentElement.dataset.listDragging;
    return () => { delete document.documentElement.dataset.listDragging; };
  }, [draggedId]);

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
    const editableTarget = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
    if (selectionMode && !editableTarget && event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey) && event.shiftKey) {
      event.preventDefault();
      archiveSelected();
      return;
    }
    if (selectionMode && !editableTarget && event.key === "Delete") {
      event.preventDefault();
      requestTrashSelected();
      return;
    }
    if (!editableTarget && event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      requestSelectAll();
      return;
    }
    if (event.key === "Escape") {
      if (selectionMode) {
        event.preventDefault();
        clearBulkSelection();
        return;
      }
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
      {selectionMode && (
        <div className="bulk-actions" role="toolbar" aria-label="Bulk document actions">
          <span><b>{selectedDocs.length}</b> selected</span>
          <button type="button" title={`${selectedDocs.every((doc) => doc.archived) ? "Restore" : "Archive"} selected (Ctrl/Cmd+Shift+A)`} onClick={archiveSelected}><IconArchive size={14} />{selectedDocs.every((doc) => doc.archived) ? "Restore" : "Archive"}<kbd>⌘/Ctrl⇧A</kbd></button>
          <button type="button" className="bulk-trash" title="Move selected to trash (Delete)" onClick={requestTrashSelected}><IconTrash size={14} />Trash<kbd>Del</kbd></button>
          <button type="button" className="icon-btn" aria-label="Clear selection" title="Clear selection (Esc)" onClick={clearBulkSelection}><IconX size={15} /></button>
        </div>
      )}
      <ul
      className="document-list"
      aria-multiselectable={selectionMode || undefined}
      {...containerProps}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Focus leaving the list entirely (not just moving into an expanded
        // row's fields) means nothing is being navigated any more.
        if (!event.currentTarget.contains(event.relatedTarget)) clearActive();
      }}
    >
      {docs.data?.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} isActive={doc.id === activeId} isSelected={selectedIds.has(doc.id)} selectionMode={selectionMode} suppressPreview={shiftSelecting} reorderable={canReorder} dragState={draggedId === doc.id ? "dragging" : dropTargetId === doc.id ? "drop-target" : undefined} suppressActivation={suppressActivation} onReorderPointerDown={(event) => onReorderPointerDown(doc, event)} onReorderPointerMove={onReorderPointerMove} onReorderPointerUp={onReorderPointerUp} onSelectForBulk={selectForBulk} onSelectRangeForBulk={selectRangeForBulk} onToggleBulkSelection={toggleBulkSelection} attention={documentAttention(doc, now)} onAcknowledge={acknowledge} onToggleComplete={(d) => void toggleComplete(d, qc)} onTogglePin={(d) => void togglePinned(d, qc)} onUpdateStatus={(d, status) => void updateStatus(d, status, qc)} />
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
      {dragPreview && <div className="document-drag-preview" aria-hidden="true" style={{ left: dragPreview.x + 14, top: dragPreview.y + 14 }}><span className="document-drag-preview-grip" /><span><small>Reordering</small><b>{dragPreview.title || "Untitled"}</b></span></div>}
    </section>
  );
}
