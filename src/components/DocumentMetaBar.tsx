import { Fragment, type ReactNode } from "react";
import { StatusSelect } from "./StatusSelect";
import { PrioritySelect } from "./PrioritySelect";
import { DueDateField } from "./DueDateField";
import { StageSelect } from "./StageSelect";
import { UrlField } from "./UrlField";
import { TypeSelect } from "./TypeSelect";
import { TagChipInput } from "./TagChipInput";
import { IconBell } from "./icons";
import { TYPE_SPECS, type MetaField } from "../lib/documentTypes";
import { native } from "../lib/native";
import type { DocumentType, SonataDocument } from "../types/domain";

/**
 * The document's metadata as one compact row of pills, showing only the fields its type
 * actually carries — a bookmark gets a link, an idea gets a stage, a note gets neither.
 *
 * Each control already names itself when unset ("No status", "No date", "Add tags…"), so
 * the stacked uppercase field labels these used to carry were pure vertical cost.
 */
export function DocumentMetaBar({
  doc,
  onChange,
  onChangeType,
}: {
  doc: SonataDocument;
  onChange: (doc: SonataDocument) => void;
  /** When given, a type pill leads the row and offers conversion from inside the editor. */
  onChangeType?: (type: DocumentType) => void;
}) {
  const spec = TYPE_SPECS[doc.type];
  // An exhaustive map rather than a switch: TypeScript rejects the object outright if a
  // MetaField is added without a control. Entries the type does not list are plain
  // elements that are never rendered, so e.g. TagChipInput's tag query stays unfired.
  const controls: Record<MetaField, ReactNode> = {
    status: <StatusSelect value={doc.status} onChange={(status) => onChange({ ...doc, status })} />,
    priority: <PrioritySelect value={doc.priority} onChange={(priority) => onChange({ ...doc, priority })} />,
    due: <DueDateField value={doc.due ?? ""} onChange={(due) => onChange({ ...doc, due: due || undefined })} />,
    // Reminders are stored but not yet delivered — nothing reads `reminder_at` — so the
    // placeholder says so rather than implying a notification will arrive.
    reminder: (
      <DueDateField
        value={doc.reminder ?? ""}
        onChange={(reminder) => onChange({ ...doc, reminder: reminder || undefined })}
        icon={IconBell}
        placeholder="No reminder"
        label="reminder (not yet delivered)"
      />
    ),
    stage: <StageSelect value={doc.stage} onChange={(stage) => onChange({ ...doc, stage })} />,
    url: (
      <UrlField
        value={doc.bookmark?.url ?? ""}
        onChange={(url) => onChange({ ...doc, bookmark: url ? { url } : undefined })}
        onOpen={(url) => void native.openExternal(url)}
      />
    ),
    tags: <TagChipInput value={doc.tags} onChange={(tags) => onChange({ ...doc, tags })} />,
  };

  return (
    // The type class is what makes `--type-color` reach the pill inside FullScreenEditor,
    // which has no type-aware root of its own.
    <div className={`meta-bar doc-type-${doc.type}`}>
      {onChangeType && (
        <TypeSelect
          value={doc.type}
          types={[doc.type, ...spec.convertsTo]}
          onChange={onChangeType}
          ariaLabel={`${spec.convertVerb} — change type`}
        />
      )}
      {spec.meta.map((field) => (
        <Fragment key={field}>{controls[field]}</Fragment>
      ))}
    </div>
  );
}
