// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentList } from "./DocumentList";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import type { DocumentSummary } from "../../types/domain";

vi.mock("../../lib/native", () => ({ native: { listDocuments: vi.fn(), readDocument: vi.fn(), updateDocument: vi.fn(), reorderDocuments: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), trash: vi.fn(), restoreFromTrash: vi.fn(), acknowledgeDocumentAttention: vi.fn() } }));

const summaryDocument = (id: string, title: string): DocumentSummary => ({
  id, title, path: `notes/${id}.md`, type: "note", tags: [], created: "", updated: "", archived: false, pinned: false, childCount: 0, completedChildCount: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ view: "all", tag: undefined, expandedId: undefined, contextMenu: undefined, filters: { sort: "default" } });
  vi.mocked(native.listDocuments).mockResolvedValue([summaryDocument("one", "First"), summaryDocument("two", "Second")]);
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
