import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { native } from "../lib/native";
import type { SonataDocument } from "../types/domain";
import { IconLink, IconSearch, IconX } from "./icons";

/** Editable, ID-backed metadata links. IDs keep relationships intact when a title changes. */
export function RelatedDocuments({ doc, onChange }: { doc: SonataDocument; onChange: (doc: SonataDocument) => void }) {
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
    <div className="related-documents">
      <span className="related-documents-label"><IconLink size={13} /> Related</span>
      <div className="document-picker" ref={pickerRef}>
        <button type="button" className="document-picker-trigger" aria-label="Add related document" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <IconLink size={13} /> Add document
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
      {linked.map((id) => {
        const title = documents.data?.find((candidate) => candidate.id === id)?.title ?? id;
        return <button key={id} className="related-document-chip" type="button" title={`Remove ${title} from related documents`} onClick={() => onChange({ ...doc, links: linked.filter((value) => value !== id) })}><span>{title}</span><IconX size={12} /></button>;
      })}
    </div>
  );
}
