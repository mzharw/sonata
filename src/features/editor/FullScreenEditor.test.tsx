// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FullScreenEditor } from "./FullScreenEditor";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import type { SonataDocument } from "../../types/domain";

vi.mock("../../lib/native", () => ({
  native: { readDocument: vi.fn(), updateDocument: vi.fn(), trash: vi.fn(), tags: vi.fn(), openExternal: vi.fn() },
}));
vi.mock("../../components/DocumentMetaBar", () => ({ DocumentMetaBar: () => null }));
vi.mock("../../components/AttachmentButton", () => ({ AttachmentButton: () => null }));
vi.mock("../../components/RelatedDocuments", () => ({ RelatedDocuments: () => null }));
vi.mock("../../components/SubtasksPanel", () => ({ SubtasksPanel: () => null }));
vi.mock("../../components/BacklinksPanel", () => ({ BacklinksPanel: () => null }));
vi.mock("../../hooks/useAttachmentUrls", () => ({ useAttachmentUrls: () => ({}) }));
vi.mock("../../hooks/useTypeConversion", () => ({ useTypeConversion: () => ({ convert: vi.fn() }) }));
vi.mock("../../components/MarkdownEditor", () => ({ MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Note body" value={value} onChange={(event) => onChange(event.target.value)} /> }));

const doc: SonataDocument = {
  id: "doc-1", path: "notes/doc-1.md", type: "note", title: "New note", body: "", tags: [],
  created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z", archived: false, pinned: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ fullScreenId: "doc-1", fullScreenIsNew: true, expandedId: undefined });
  vi.mocked(native.readDocument).mockResolvedValue(doc);
  vi.mocked(native.updateDocument).mockResolvedValue(doc);
  vi.mocked(native.trash).mockResolvedValue();
});
afterEach(cleanup);

function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FullScreenEditor id="doc-1" /></QueryClientProvider>);
}

it("keeps full-screen edits as a draft and lets the user discard them when leaving", async () => {
  mount();
  await waitFor(() => expect(screen.getByLabelText("Title")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft title" } });
  fireEvent.click(screen.getByLabelText("Back to list"));

  expect(screen.getByRole("alertdialog", { name: "Save changes before leaving" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Don’t save" }));

  await waitFor(() => expect(native.trash).toHaveBeenCalledWith("doc-1"));
  expect(native.updateDocument).not.toHaveBeenCalled();
  expect(useUi.getState().fullScreenId).toBeUndefined();
});

it("discards an untouched new full-screen note without prompting or saving", async () => {
  mount();
  await waitFor(() => expect(screen.getByLabelText("Title")).toBeTruthy());
  fireEvent.click(screen.getByLabelText("Back to list"));

  await waitFor(() => expect(native.trash).toHaveBeenCalledWith("doc-1"));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(native.updateDocument).not.toHaveBeenCalled();
});
