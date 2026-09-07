import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Attachment, DocumentSummary, SearchQuery, SonataDocument } from "../types/domain";

async function setSidebarPickerOpen(pickerOpen: boolean) {
  try {
    await invoke<void>("set_sidebar_picker_open", { pickerOpen });
  } catch {
    // Browser development has no sidebar command.
  }
}

async function openWithSidebarFrozen(options: Parameters<typeof open>[0]) {
  // Browser development has no sidebar command. The dialog remains usable
  // there; only the desktop panel gets the temporary auto-hide pause.
  await setSidebarPickerOpen(true);
  try {
    return await open(options);
  } finally {
    await setSidebarPickerOpen(false);
  }
}

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
  importAttachment: (documentId: string, sourcePath: string) => invoke<Attachment>("import_attachment", { documentId, sourcePath }),
  importClipboardImage: (documentId: string, mediaType: string, dataBase64: string) => invoke<Attachment>("import_clipboard_image", { documentId, mediaType, dataBase64 }),
  readAttachment: (path: string) => invoke<Attachment>("read_attachment", { path }),
  revealAttachmentInExplorer: (path: string) => invoke<void>("reveal_attachment_in_explorer", { path }),
  chooseAttachment: () => openWithSidebarFrozen({ multiple: false, title: "Attach file" }),
  chooseCoverImage: () => openWithSidebarFrozen({ multiple: false, title: "Choose cover image", filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }] }),
  rebuild: () => invoke<void>("rebuild_index"),
  chooseWorkspace: async () => {
    const path = await openWithSidebarFrozen({ directory: true, multiple: false, title: "Choose Sonata workspace" });
    if (path !== null) await invoke<void>("open_workspace", { path });
    return path;
  }
};
