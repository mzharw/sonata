// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTypeConversion } from "./useTypeConversion";
import { native } from "../lib/native";
import { useUi } from "../stores/ui";
import type { DocumentType, SonataDocument } from "../types/domain";

vi.mock("../lib/native", () => ({
  native: { readDocument: vi.fn(), setDocumentType: vi.fn() },
}));

const doc = (over: Partial<SonataDocument> = {}): SonataDocument => ({
  id: "01ABC",
  path: "inbox/x.md",
  type: "inbox",
  title: "Sort me out",
  body: "",
  tags: [],
  created: "",
  updated: "",
  archived: false,
  pinned: false,
  contentHash: "h1",
  ...over,
});

let convert: (doc: { id: string }, to: DocumentType, onApplied?: (d: SonataDocument) => void) => Promise<void>;
let qc: QueryClient;

function Harness() {
  convert = useTypeConversion().convert;
  return null;
}

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ confirm: undefined, toast: undefined });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
});
afterEach(cleanup);

describe("a lossless conversion", () => {
  beforeEach(() => {
    // Only tags are set, and every type accepts tags.
    vi.mocked(native.readDocument).mockResolvedValue(doc({ tags: ["work"] }));
    vi.mocked(native.setDocumentType).mockResolvedValue(doc({ type: "note", path: "notes/x.md", contentHash: "h2" }));
  });

  // A one-click "Triage →" that stops to confirm is not one click.
  it("converts immediately, without asking", async () => {
    await act(() => convert({ id: "01ABC" }, "note"));
    expect(useUi.getState().confirm).toBeUndefined();
    expect(native.setDocumentType).toHaveBeenCalledWith("01ABC", "note", "h1");
  });

  it("offers undo, which genuinely restores the type", async () => {
    await act(() => convert({ id: "01ABC" }, "note"));
    const toast = useUi.getState().toast;
    expect(toast?.message).toBe('Converted "Sort me out" to Note');
    expect(toast?.onUndo).toBeTypeOf("function");

    await act(async () => toast?.onUndo?.());
    expect(native.setDocumentType).toHaveBeenLastCalledWith("01ABC", "inbox", "h2");
  });

  it("hands the caller the converted document, whose path has changed", async () => {
    const onApplied = vi.fn();
    await act(() => convert({ id: "01ABC" }, "note", onApplied));
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ path: "notes/x.md", contentHash: "h2" }));
  });

  // Easy to miss: the row's hover preview caches a full document, so it would keep
  // serving the pre-conversion type and path.
  it("drops the stale hover-preview cache", async () => {
    qc.setQueryData(["preview", "01ABC"], doc());
    expect(qc.getQueryData(["preview", "01ABC"])).toBeDefined();

    await act(() => convert({ id: "01ABC" }, "note"));
    expect(qc.getQueryData(["preview", "01ABC"])).toBeUndefined();
  });
});

describe("a lossy conversion", () => {
  beforeEach(() => {
    vi.mocked(native.readDocument).mockResolvedValue(doc({ type: "task", status: "todo", due: "2026-02-01", priority: "high" }));
    vi.mocked(native.setDocumentType).mockResolvedValue(doc({ type: "note", path: "notes/x.md" }));
  });

  it("asks first, naming exactly what will be removed", async () => {
    await act(() => convert({ id: "01ABC" }, "note"));
    expect(native.setDocumentType).not.toHaveBeenCalled();
    expect(useUi.getState().confirm?.message).toBe(
      'Convert "Sort me out" to Note? Its status, priority and due date will be removed.',
    );
    expect(useUi.getState().confirm?.confirmLabel).toBe("Convert to Note");
  });

  // The dropped values are gone from the Markdown, so an undo would be a lie.
  it("offers no undo once confirmed", async () => {
    await act(() => convert({ id: "01ABC" }, "note"));
    await act(async () => useUi.getState().confirm?.onConfirm());
    expect(native.setDocumentType).toHaveBeenCalledWith("01ABC", "note", "h1");
    expect(useUi.getState().toast?.onUndo).toBeUndefined();
  });

  it("changes nothing if the confirm is never answered", async () => {
    await act(() => convert({ id: "01ABC" }, "note"));
    expect(native.setDocumentType).not.toHaveBeenCalled();
  });
});

describe("conversion edge cases", () => {
  it("does nothing when the document is already that type", async () => {
    vi.mocked(native.readDocument).mockResolvedValue(doc({ type: "note" }));
    await act(() => convert({ id: "01ABC" }, "note"));
    expect(native.setDocumentType).not.toHaveBeenCalled();
    expect(useUi.getState().confirm).toBeUndefined();
  });

  it("reports a failed conversion rather than failing silently", async () => {
    vi.mocked(native.readDocument).mockResolvedValue(doc());
    vi.mocked(native.setDocumentType).mockRejectedValue(new Error("write conflict"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(() => convert({ id: "01ABC" }, "note"));
    expect(useUi.getState().toast?.message).toMatch(/Couldn't change the type/);
  });

  it("reports a document it could not even read", async () => {
    vi.mocked(native.readDocument).mockRejectedValue(new Error("gone"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(() => convert({ id: "01ABC" }, "note"));
    expect(native.setDocumentType).not.toHaveBeenCalled();
    expect(useUi.getState().toast?.message).toMatch(/Couldn't change the type/);
  });
});
