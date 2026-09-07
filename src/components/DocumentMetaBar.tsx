import { StatusSelect } from "./StatusSelect";
import { PrioritySelect } from "./PrioritySelect";
import { DueDateField } from "./DueDateField";
import { TagChipInput } from "./TagChipInput";
import type { SonataDocument } from "../types/domain";

/**
 * Status, priority, due date and tags as one compact row of pills.
 *
 * Each control already names itself when unset ("No status", "No date",
 * "Add tags…"), so the stacked uppercase field labels these used to carry were
 * pure vertical cost — four rows of chrome above the body of a note.
 */
export function DocumentMetaBar({
  doc,
  onChange,
}: {
  doc: SonataDocument;
  onChange: (doc: SonataDocument) => void;
}) {
  return (
    <div className="meta-bar">
      <StatusSelect value={doc.status} onChange={(status) => onChange({ ...doc, status })} />
      <PrioritySelect value={doc.priority} onChange={(priority) => onChange({ ...doc, priority })} />
      <DueDateField value={doc.due ?? ""} onChange={(due) => onChange({ ...doc, due: due || undefined })} />
      <TagChipInput value={doc.tags} onChange={(tags) => onChange({ ...doc, tags })} />
    </div>
  );
}
