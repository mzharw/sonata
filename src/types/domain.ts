export type DocumentType = "inbox" | "note" | "task" | "idea" | "bookmark";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
/** How far an idea has been taken — the idea-type analogue of `TaskStatus`. */
export type IdeaStage = "spark" | "developing" | "parked";
export interface SonataDocument { id: string; path: string; type: DocumentType; title: string; body: string; tags: string[]; created: string; updated: string; archived: boolean; pinned: boolean; status?: TaskStatus; priority?: Priority; stage?: IdeaStage; due?: string; reminder?: string; parent?: string | null; links?: string[]; bookmark?: { url: string }; cover?: string; contentHash?: string; }
export interface Attachment { path: string; name: string; mediaType: string; dataUrl?: string; }
export interface DocumentSummary extends Omit<SonataDocument, "body"> { childCount: number; completedChildCount: number; }
/** `"default"` defers to the listed type's natural order, resolved in Rust from its `TypeSpec`. */
export type SortOrder = "default" | "due" | "updated" | "created" | "priority" | "title";
export interface SearchQuery { text?: string; type?: DocumentType; tag?: string; status?: TaskStatus; priority?: Priority; due?: "today" | "upcoming"; archived?: boolean; sort?: SortOrder; }
