export type DocumentType = "inbox" | "note" | "task" | "idea" | "bookmark";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export interface SonataDocument { id: string; path: string; type: DocumentType; title: string; body: string; tags: string[]; created: string; updated: string; archived: boolean; pinned: boolean; status?: TaskStatus; priority?: Priority; due?: string; reminder?: string; parent?: string | null; links?: string[]; bookmark?: { url: string }; cover?: string; contentHash?: string; }
export interface Attachment { path: string; name: string; mediaType: string; dataUrl?: string; }
export interface DocumentSummary extends Omit<SonataDocument, "body"> { childCount: number; completedChildCount: number; }
export type SortOrder = "default" | "updated" | "created" | "priority" | "title";
export interface SearchQuery { text?: string; type?: DocumentType; tag?: string; status?: TaskStatus; priority?: Priority; due?: "today" | "upcoming"; archived?: boolean; sort?: SortOrder; }
