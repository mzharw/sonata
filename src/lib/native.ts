import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DocumentSummary, SearchQuery, SonataDocument } from "../types/domain";

export const native = {
  showSidebar: () => invoke<void>("show_sidebar"),
  hideSidebar: () => invoke<void>("hide_sidebar"),
  listDocuments: (query: SearchQuery = {}) => invoke<DocumentSummary[]>("list_documents", { query }),
  readDocument: (id: string) => invoke<SonataDocument>("read_document", { id }),
  createDocument: (input: Partial<SonataDocument>) => invoke<SonataDocument>("create_document", { input }),
  updateDocument: (document: SonataDocument, expectedHash?: string) => invoke<SonataDocument>("update_document", { document, expectedHash }),
  setParent: (childId: string, parentId: string | null) => invoke<void>("set_parent", { childId, parentId }),
  archive: (id: string) => invoke<void>("archive_document", { id }),
  unarchive: (id: string) => invoke<void>("unarchive_document", { id }),
  trash: (id: string) => invoke<void>("move_document_to_trash", { id }),
  tags: () => invoke<Array<{ tag: string; count: number }>>("list_tags"),
  children: (id: string) => invoke<DocumentSummary[]>("list_children", { id }),
  backlinks: (id: string) => invoke<DocumentSummary[]>("list_backlinks", { id }),
  capture: (text: string) => invoke<SonataDocument>("quick_capture", { text }),
  rebuild: () => invoke<void>("rebuild_index"),
  chooseWorkspace: async () => {
    const path = await open({ directory: true, multiple: false, title: "Choose Sonata workspace" });
    if (path !== null) await invoke<void>("open_workspace", { path });
    return path;
  }
};
