import { type ReactNode } from "react";
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

const FIELD_LABELS: Record<MetaField, string> = {
  status: "Status",
  priority: "Priority",
  due: "Due date",
  reminder: "Reminder",
  stage: "Stage",
  url: "Link",
  tags: "Tags",
};

/**
 * The document's metadata as one compact row of pills, showing only the fields its type
 * actually carries — a bookmark gets a link, an idea gets a stage, a note gets neither.
 *
 * The most-glanced task state is editable directly from the chip row. Supporting metadata
 * stays compact below it, so opening a document reads like a document rather than a form.
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
    reminder: (
      <DueDateField
        value={doc.reminder ?? ""}
        onChange={(reminder) => onChange({ ...doc, reminder: reminder || undefined })}
        icon={IconBell}
        placeholder="Add reminder"
        label="reminder"
        withTime
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
  const renderField = (field: MetaField) => (
    <div className={`meta-field meta-field-${field}`} key={field}>
      <span className="meta-field-label">{FIELD_LABELS[field]}</span>
      <div className="meta-field-control">{controls[field]}</div>
    </div>
  );
  const chipFields = spec.meta.filter((field) => field === "status" || field === "priority" || field === "stage");

  return (
    // The type class is what makes `--type-color` reach the pill inside FullScreenEditor,
    // which has no type-aware root of its own.
    <div className={`meta-bar doc-type-${doc.type}`} role="group" aria-label={`${spec.label} metadata`}>
      {(onChangeType || chipFields.length > 0) && (
        <div className="meta-chips" role="group" aria-label="Primary properties">
          {onChangeType && (
            <TypeSelect
              value={doc.type}
              types={[doc.type, ...spec.convertsTo]}
              onChange={onChangeType}
              ariaLabel={`${spec.convertVerb} — change type`}
            />
          )}
          {chipFields.map((field) => <div className="meta-chip" key={field}>{controls[field]}</div>)}
        </div>
      )}
      {(spec.meta.includes("due") || spec.meta.includes("tags") || spec.meta.includes("reminder")) && (
        <div className="meta-details">
          {(spec.meta.includes("due") || spec.meta.includes("reminder")) && <div className="meta-detail-column">
            {spec.meta.includes("due") && renderField("due")}
            {spec.meta.includes("reminder") && renderField("reminder")}
          </div>}
          {spec.meta.includes("tags") && <div className="meta-detail-column">{renderField("tags")}</div>}
        </div>
      )}
      {spec.meta.includes("url") && <div className="meta-details meta-details-link">{renderField("url")}</div>}
    </div>
  );
}
