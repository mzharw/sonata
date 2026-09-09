import { create } from "zustand";
import type { Priority, SortOrder, TaskStatus } from "../types/domain";
export type View = "inbox" | "all" | "today" | "upcoming" | "tasks" | "notes" | "ideas" | "bookmarks" | "completed" | "archive" | "tag";

export interface ConfirmRequest { message: string; confirmLabel: string; onConfirm: () => void }
export type ContextMenu =
  | { kind: "document"; documentId: string }
  | { kind: "navigation"; x: number; y: number };
/** Refinements layered on top of whichever view is selected. */
export interface Filters { status?: TaskStatus; priority?: Priority; tags?: string[]; sort: SortOrder }
export const NO_FILTERS: Filters = { sort: "default" };
/** How many refinements are narrowing the list — sort reorders, so it doesn't count. */
export const activeFilterCount = (f: Filters) => (f.status ? 1 : 0) + (f.priority ? 1 : 0) + (f.tags?.length ? 1 : 0);
export interface ToastRequest { message: string; onUndo?: () => void }

interface Ui {
  view: View;
  tag?: string;
  expandedId?: string;
  fullScreenId?: string;
  palette: boolean;
  filters: Filters;
  confirm?: ConfirmRequest;
  toast?: ToastRequest;
  contextMenu?: ContextMenu;
  previewedId?: string;
  setView: (view: View, tag?: string) => void;
  expand: (id?: string) => void;
  openFullScreen: (id?: string) => void;
  setPalette: (palette: boolean) => void;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  requestConfirm: (request: ConfirmRequest) => void;
  clearConfirm: () => void;
  showToast: (toast: ToastRequest) => void;
  clearToast: () => void;
  openContextMenu: (menu: ContextMenu) => void;
  closeContextMenu: () => void;
  preview: (id?: string) => void;
}
export const useUi = create<Ui>((set) => ({
  view: "all",
  palette: false,
  // Deliberately survive a view change: a filter you set is a lens you chose,
  // and silently dropping it on navigation hides rows with no explanation.
  filters: NO_FILTERS,
  setView: (view, tag) => set({ view, tag, expandedId: undefined }),
  expand: (expandedId) => set({ expandedId }),
  openFullScreen: (fullScreenId) => set({ fullScreenId, expandedId: undefined }),
  setPalette: (palette) => set({ palette }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
  requestConfirm: (confirm) => set({ confirm }),
  clearConfirm: () => set({ confirm: undefined }),
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: undefined }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: undefined }),
  preview: (previewedId) => set({ previewedId }),
}));
