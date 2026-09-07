import { DOCUMENT_TYPES, TYPE_SPECS } from "../../lib/documentTypes";
import type { DocumentType, SearchQuery } from "../../types/domain";
import type { View } from "../../stores/ui";

export type ViewGroup = "type" | "status";

/** The view that lists exactly one type, derived rather than spelled out per type. */
const VIEW_TYPE = new Map<View, DocumentType>(DOCUMENT_TYPES.map((t) => [TYPE_SPECS[t].view, t]));
/** Whichever type owns Today / Upcoming / Completed. */
const STATUS_VIEW_TYPE = DOCUMENT_TYPES.find((t) => TYPE_SPECS[t].ownsStatusViews);

export const sections: Array<[View, string, DocumentType?, ViewGroup?]> = [
  ["all", "All", undefined, "type"],
  ...DOCUMENT_TYPES.map(
    (t) => [TYPE_SPECS[t].view, TYPE_SPECS[t].plural, t, "type"] as [View, string, DocumentType, ViewGroup],
  ),
  ["archive", "Archive", undefined, "type"],
  ["today", "Today", STATUS_VIEW_TYPE, "status"],
  ["upcoming", "Upcoming", STATUS_VIEW_TYPE, "status"],
  ["completed", "Completed", STATUS_VIEW_TYPE, "status"],
];

export function queryFor(view: View, tag?: string): SearchQuery {
  if (view === "today") return { type: STATUS_VIEW_TYPE, due: "today" };
  if (view === "upcoming") return { type: STATUS_VIEW_TYPE, due: "upcoming" };
  if (view === "completed") return { type: STATUS_VIEW_TYPE, status: "completed" };
  if (view === "archive") return { archived: true };
  if (view === "tag") return { tag };
  // "all" has no type, and so does any view the registry does not map. This replaces
  // depluralizing the view name with `slice(0, -1)`, which only ever worked by luck.
  const type = VIEW_TYPE.get(view);
  return type ? { type } : {};
}
