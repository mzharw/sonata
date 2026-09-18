// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentList } from "./DocumentList";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import type { DocumentSummary } from "../../types/domain";

vi.mock("../../lib/native", () => ({ native: { listDocuments: vi.fn(), readDocument: vi.fn(), updateDocument: vi.fn(), reorderDocuments: vi.fn(), reorderGroupDocuments: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), trash: vi.fn(), restoreFromTrash: vi.fn(), acknowledgeDocumentAttention: vi.fn(), groups: vi.fn(), tags: vi.fn(), addDocumentsToGroup: vi.fn(), removeDocumentsFromGroup: vi.fn(), createGroup: vi.fn() } }));

const summaryDocument = (id: string, title: string): DocumentSummary => ({
  id, title, path: `notes/${id}.md`, type: "note", tags: [], created: "", updated: "", archived: false, pinned: false, childCount: 0, completedChildCount: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ view: "all", tag: undefined, expandedId: undefined, contextMenu: undefined, filters: { sort: "default" } });
  vi.mocked(native.listDocuments).mockResolvedValue([summaryDocument("one", "First"), summaryDocument("two", "Second")]);
  vi.mocked(native.groups).mockResolvedValue([]);
  vi.mocked(native.tags).mockResolvedValue([{ tag: "work", count: 2 }]);
});
afterEach(cleanup);

it("selects from the context menu and adds more rows with a click", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

  fireEvent.contextMenu(screen.getByText("First"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Select this document" }));
  expect(screen.getByRole("toolbar", { name: "Bulk document actions" }).textContent).toContain("1 selected");

  fireEvent.click(screen.getByText("Second"));
  expect(screen.getByRole("toolbar", { name: "Bulk document actions" }).textContent).toContain("2 selected");
});

it("selects every row between the anchor and a Shift-click", async () => {
  vi.mocked(native.listDocuments).mockResolvedValue([
    summaryDocument("one", "First"),
    summaryDocument("two", "Second"),
    summaryDocument("three", "Third"),
  ]);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("Third")).toBeTruthy());

  fireEvent.contextMenu(screen.getByText("First"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Select this document" }));
  fireEvent.click(screen.getByText("Third"), { shiftKey: true });

  expect(screen.getByRole("toolbar", { name: "Bulk document actions" }).textContent).toContain("3 selected");
});

it("selects every visible row with Ctrl+A from the list", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

  fireEvent.keyDown(screen.getByRole("listbox"), { key: "a", ctrlKey: true });

  expect(screen.getByRole("toolbar", { name: "Bulk document actions" }).textContent).toContain("2 selected");
});

it("archives selected rows with Ctrl+Shift+A", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

  const list = screen.getByRole("listbox");
  fireEvent.keyDown(list, { key: "a", ctrlKey: true });
  fireEvent.keyDown(list, { key: "a", ctrlKey: true, shiftKey: true });

  await waitFor(() => expect(native.archive).toHaveBeenCalledTimes(2));
  useUi.getState().toast?.onUndo?.();
  await waitFor(() => expect(native.unarchive).toHaveBeenCalledTimes(2));
});

it("suppresses Shift text selection outside editable fields", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><input aria-label="Editable field" /><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

  fireEvent.keyDown(document, { key: "Shift" });
  expect(document.documentElement.dataset.shiftSelection).toBe("true");
  fireEvent.keyUp(document, { key: "Shift" });
  expect(document.documentElement.dataset.shiftSelection).toBeUndefined();

  screen.getByLabelText("Editable field").focus();
  fireEvent.keyDown(document, { key: "Shift" });
  expect(document.documentElement.dataset.shiftSelection).toBeUndefined();
});

it("persists the complete default list in its dropped order", async () => {
  vi.mocked(native.reorderDocuments).mockResolvedValue();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

  const first = screen.getByText("First").closest("li")!;
  const second = screen.getByText("Second").closest("li")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => first });
  fireEvent.pointerDown(second.querySelector(".doc-drag-handle")!, { clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(second, { clientX: 10, clientY: 80, pointerId: 1 });
  fireEvent.pointerUp(second, { clientY: 80, pointerId: 1 });

  await waitFor(() => expect(native.reorderDocuments).toHaveBeenCalledWith(["two", "one"]));
});

it("persists a grouped row drop as that group's order", async () => {
  vi.mocked(native.groups).mockResolvedValue([{ id: "project", name: "Project Aurora", documentIds: ["one", "two"] }]);
  vi.mocked(native.reorderGroupDocuments).mockResolvedValue();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: /Project Aurora/ })).toBeTruthy());

  const first = screen.getByText("First").closest("li")!;
  const second = screen.getByText("Second").closest("li")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => first });
  fireEvent.pointerDown(second.querySelector(".doc-drag-handle")!, { clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(second, { clientX: 10, clientY: 80, pointerId: 1 });
  fireEvent.pointerUp(second, { clientY: 80, pointerId: 1 });

  await waitFor(() => expect(native.reorderGroupDocuments).toHaveBeenCalledWith("project", ["two", "one"]));
});

it("makes archiving the primary selection action", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
  fireEvent.contextMenu(screen.getByText("First"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Select this document" }));

  const toolbar = screen.getByRole("toolbar", { name: "Bulk document actions" });
  expect(toolbar.querySelector(".bulk-primary")?.textContent).toContain("Archive");
  expect(toolbar.querySelector(".bulk-action-menu")).toBeNull();
});

it("unwinds the group form, group menu, and selection one Escape at a time", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
  fireEvent.contextMenu(screen.getByText("First"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Select this document" }));
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New group…" }));

  fireEvent.keyDown(screen.getByLabelText("New group name"), { key: "Escape" });
  expect(screen.getByRole("menu", { name: "Group selected documents" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu", { name: "Group selected documents" })).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("toolbar", { name: "Bulk document actions" })).toBeNull();
});

it("shows loose, collapsible group sections and assigns selected rows", async () => {
  vi.mocked(native.groups).mockResolvedValue([{ id: "project", name: "Project Aurora", documentIds: ["one"] }]);
  vi.mocked(native.addDocumentsToGroup).mockResolvedValue();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: /Project Aurora/ })).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: /Project Aurora/ }));
  expect(screen.queryByText("First")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Project Aurora/ }));

  fireEvent.contextMenu(screen.getByText("Second"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Select this document" }));
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  fireEvent.click(screen.getByRole("menu", { name: "Group selected documents" }).querySelector("button")!);
  await waitFor(() => expect(native.addDocumentsToGroup).toHaveBeenCalledWith("project", ["two"]));
});

it("removes a document from its group without changing its tags", async () => {
  vi.mocked(native.groups).mockResolvedValue([{ id: "project", name: "Project Aurora", documentIds: ["one"] }]);
  vi.mocked(native.removeDocumentsFromGroup).mockResolvedValue();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DocumentList search="" /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
  fireEvent.contextMenu(screen.getByText("First"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));
  expect(native.removeDocumentsFromGroup).toHaveBeenCalledWith(["one"]);
});
