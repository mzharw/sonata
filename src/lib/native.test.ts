// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { native } from "./native";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("workspace selection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("opens the selected folder with the registered backend command", async () => {
    vi.mocked(open).mockResolvedValue("/notes");
    await expect(native.chooseWorkspace()).resolves.toBe("/notes");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, multiple: false }));
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: true });
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: false });
    expect(invoke).toHaveBeenCalledWith("open_workspace", { path: "/notes" });
  });

  it("leaves the workspace alone when the picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(native.chooseWorkspace()).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: true });
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: false });
  });

  it("propagates open failures for display in the UI", async () => {
    vi.mocked(open).mockResolvedValue("/notes");
    vi.mocked(invoke).mockRejectedValue("Permission denied");
    await expect(native.chooseWorkspace()).rejects.toBe("Permission denied");
  });
});

describe("attachment selection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("freezes the sidebar while a file picker is open", async () => {
    vi.mocked(open).mockResolvedValue("/photos/cover.png");
    await expect(native.chooseAttachment()).resolves.toBe("/photos/cover.png");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, title: "Attach file" }));
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: true });
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: false });
  });

  it("returns null when attachment selection is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(native.chooseAttachment()).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: true });
    expect(invoke).toHaveBeenCalledWith("set_sidebar_picker_open", { pickerOpen: false });
  });

  it("sends the selected source path to the registered native importer", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: "attachments/id/cover.png" });
    await native.importAttachment("id", "/photos/cover.png");
    expect(invoke).toHaveBeenCalledWith("import_attachment", { documentId: "id", sourcePath: "/photos/cover.png" });
  });

  it("sends clipboard image bytes to the registered native importer", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: "attachments/id/clipboard-image.png" });
    await native.importClipboardImage("id", "image/png", "aGVsbG8=");
    expect(invoke).toHaveBeenCalledWith("import_clipboard_image", { documentId: "id", mediaType: "image/png", dataBase64: "aGVsbG8=" });
  });

  it("asks the native layer to reveal an attachment in File Explorer", async () => {
    await native.revealAttachmentInExplorer("attachments/id/report.pdf");
    expect(invoke).toHaveBeenCalledWith("reveal_attachment_in_explorer", { path: "attachments/id/report.pdf" });
  });
});

describe("type conversion and external links", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends the type as a camelCase command argument", async () => {
    await native.setDocumentType("01ABC", "task");
    expect(invoke).toHaveBeenCalledWith("set_document_type", {
      id: "01ABC",
      documentType: "task",
      expectedHash: undefined,
    });
  });

  it("passes the expected hash through so a stale conversion is rejected", async () => {
    await native.setDocumentType("01ABC", "note", "abc123");
    expect(invoke).toHaveBeenCalledWith("set_document_type", {
      id: "01ABC",
      documentType: "note",
      expectedHash: "abc123",
    });
  });

  it("acknowledges only the attention values the UI evaluated", async () => {
    await native.acknowledgeDocumentAttention("01ABC", "2026-09-08", "2026-09-08T09:30");
    expect(invoke).toHaveBeenCalledWith("acknowledge_document_attention", {
      id: "01ABC",
      due: "2026-09-08",
      reminder: "2026-09-08T09:30",
    });
  });

  it("opens a link through the opener plugin", async () => {
    await native.openExternal("https://example.com");
    expect(openUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("falls back to a new tab when there is no opener plugin", async () => {
    vi.mocked(openUrl).mockRejectedValue(new Error("no plugin"));
    const spy = vi.spyOn(window, "open").mockReturnValue(null);
    await native.openExternal("https://example.com");
    expect(spy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener");
    spy.mockRestore();
  });
});
