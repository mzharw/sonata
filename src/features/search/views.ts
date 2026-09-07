import type { DocumentType, SearchQuery } from "../../types/domain";
import type { View } from "../../stores/ui";

export type ViewGroup = "type" | "status";

export const sections: Array<[View, string, DocumentType?, ViewGroup?]> = [
  ["all", "All", undefined, "type"],
  ["inbox", "Inbox", "inbox", "type"],
  ["tasks", "Tasks", "task", "type"],
  ["notes", "Notes", "note", "type"],
  ["ideas", "Ideas", "idea", "type"],
  ["bookmarks", "Bookmarks", "bookmark", "type"],
  ["archive", "Archive", undefined, "type"],
  ["today", "Today", "task", "status"],
  ["upcoming", "Upcoming", "task", "status"],
  ["completed", "Completed", "task", "status"],
];

export function queryFor(view: View, tag?: string): SearchQuery {
  if (view === "all") return {};
  if (view === "today") return { type: "task", due: "today" };
  if (view === "upcoming") return { type: "task", due: "upcoming" };
  if (view === "completed") return { type: "task", status: "completed" };
  if (view === "archive") return { archived: true };
  if (view === "tag") return { tag };
  return view === "inbox" ? { type: "inbox" } : { type: view.slice(0, -1) as DocumentType };
}
