import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { native } from "../lib/native";
import { useUi } from "../stores/ui";
import { TYPE_SPECS } from "../lib/documentTypes";
import type { SonataDocument } from "../types/domain";
import { IconPlus, IconSearch, IconX } from "./icons";

/** Editable, ID-backed metadata links. IDs keep relationships intact when a title changes. */
export function RelatedDocuments({ doc, onChange, onOpenDocument }: { doc: SonataDocument; onChange: (doc: SonataDocument) => void; onOpenDocument?: (id: string) => void }) {
  const ui = useUi();
  const documents = useQuery({ queryKey: ["reference-documents"], queryFn: () => native.listDocuments({}) });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), pickerRef, popoverRef);
  const linked = doc.links ?? [];
  const available = (documents.data ?? []).filter((candidate) => candidate.id !== doc.id && !linked.includes(candidate.id));
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle ? available : available.filter((candidate) => `${candidate.title} ${candidate.tags.join(" ")}`.toLowerCase().includes(needle));
  }, [available, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: Math.min(rect.bottom + 6, window.innerHeight - 12), left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  return (
    <div className={`related-documents${linked.length ? " has-links" : ""}`}>
      {linked.map((id) => {
        const related = documents.data?.find((candidate) => candidate.id === id);
        const title = related?.title ?? id;
        const TypeIcon = related ? TYPE_SPECS[related.type].icon : undefined;
        const accentVar = related ? TYPE_SPECS[related.type].accentVar : undefined;
        const openRelated = () => {
          if (onOpenDocument) {
            onOpenDocument(id);
            return;
          }
          if (ui.fullScreenId) ui.openFullScreen(undefined);
          ui.expand(id);
        };
        return <div key={id} className="related-document-chip">
          {TypeIcon && accentVar && <span className="related-document-type-icon" style={{ color: `var(${accentVar})` }}><TypeIcon size={13} /></span>}
          <button type="button" className="related-document-chip-title" aria-label={`Open ${title}`} onClick={openRelated}>{title}</button>
          <button type="button" className="related-document-chip-remove" aria-label={`Remove ${title} from related documents`} onClick={() => onChange({ ...doc, links: linked.filter((value) => value !== id) })}><IconX size={12} /></button>
        </div>;
      })}
      <div className="document-picker" ref={pickerRef}>
        <button type="button" className="document-picker-trigger" aria-label="Add related document" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <IconPlus size={13} /> Add related document
        </button>
        {open && createPortal(
          <div ref={popoverRef} className="document-picker-popover" role="dialog" aria-label="Add related document" style={position}>
            <label className="document-picker-search"><IconSearch size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" /></label>
            <div className="document-picker-results" role="listbox">
              {matches.length ? matches.map((candidate) => (
                <button key={candidate.id} type="button" role="option" onClick={() => { onChange({ ...doc, links: [...linked, candidate.id] }); setOpen(false); setQuery(""); }}>
                  <span>{candidate.title || "Untitled"}</span>
                  <small>{candidate.type}{candidate.tags.length ? ` · #${candidate.tags.join(" #")}` : ""}</small>
                </button>
              )) : <p>No matching documents</p>}
            </div>
          </div>
        , document.body)}
      </div>
    </div>
  );
}
