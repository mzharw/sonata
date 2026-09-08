import { useQuery } from "@tanstack/react-query";
import { native } from "../lib/native";
import type { SonataDocument } from "../types/domain";

/** Editable, ID-backed metadata links. IDs keep relationships intact when a title changes. */
export function RelatedDocuments({ doc, onChange }: { doc: SonataDocument; onChange: (doc: SonataDocument) => void }) {
  const documents = useQuery({ queryKey: ["reference-documents"], queryFn: () => native.listDocuments({}) });
  const linked = doc.links ?? [];
  const available = (documents.data ?? []).filter((candidate) => candidate.id !== doc.id && !linked.includes(candidate.id));

  return (
    <div className="related-documents">
      <label>
        Related
        <select aria-label="Add related document" value="" onChange={(event) => {
          const id = event.target.value;
          if (id) onChange({ ...doc, links: [...linked, id] });
        }}>
          <option value="">Add a document…</option>
          {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title || "Untitled"}</option>)}
        </select>
      </label>
      {linked.map((id) => {
        const title = documents.data?.find((candidate) => candidate.id === id)?.title ?? id;
        return <button key={id} type="button" onClick={() => onChange({ ...doc, links: linked.filter((value) => value !== id) })}>× {title}</button>;
      })}
    </div>
  );
}
