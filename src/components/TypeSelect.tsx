import { IconDropdown } from "./IconDropdown";
import { DOCUMENT_TYPES, typeOptions } from "../lib/documentTypes";
import type { DocumentType } from "../types/domain";

/**
 * The type pill. Serves both picking a type at capture time and converting an existing
 * document, so `types` is usually the current type plus its `convertsTo` list.
 */
export function TypeSelect({
  value,
  onChange,
  types = DOCUMENT_TYPES,
  compact,
  showChevron,
  className,
  ariaLabel,
}: {
  value: DocumentType;
  onChange: (type: DocumentType) => void;
  types?: readonly DocumentType[];
  /** Icon only — for the row's action cluster, where there is no space for a label. */
  compact?: boolean;
  /** Defaults to `!compact`. Quick Add keeps the chevron: it is the only cue the icon opens. */
  showChevron?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <IconDropdown
      ariaLabel={ariaLabel ?? "Type"}
      className={className ?? "type-dropdown"}
      value={value}
      options={typeOptions(types)}
      onChange={(v) => onChange(v as DocumentType)}
      showLabel={!compact}
      showChevron={showChevron ?? !compact}
    />
  );
}
