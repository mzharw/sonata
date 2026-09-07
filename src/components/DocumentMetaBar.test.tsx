// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentMetaBar } from "./DocumentMetaBar";
import { native } from "../lib/native";
import type { DocumentType, SonataDocument } from "../types/domain";

vi.mock("../lib/native", () => ({
  native: { tags: vi.fn(), openExternal: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(native.tags).mockResolvedValue([]);
});
afterEach(cleanup);

const doc = (over: Partial<SonataDocument> = {}): SonataDocument => ({
  id: "01ABC",
  path: "inbox/x.md",
  type: "inbox",
  title: "X",
  body: "",
  tags: [],
  created: "",
  updated: "",
  archived: false,
  pinned: false,
  ...over,
});

function mount(type: DocumentType, over: Partial<SonataDocument> = {}, onChangeType?: () => void) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DocumentMetaBar doc={doc({ type, ...over })} onChange={() => {}} onChangeType={onChangeType} />
    </QueryClientProvider>,
  );
}

/** The controls a type offers, by the accessible name each one exposes. */
const CONTROLS = {
  status: "Status",
  priority: "Priority",
  due: "Choose due date",
  reminder: "Choose reminder (not yet delivered)",
  stage: "Stage",
  url: "URL",
} as const;

function expectOnly(...present: Array<keyof typeof CONTROLS>) {
  for (const [field, name] of Object.entries(CONTROLS)) {
    const shown = present.includes(field as keyof typeof CONTROLS);
    const found = screen.queryAllByLabelText(name).length > 0;
    expect(found, `${field} should${shown ? "" : " not"} be shown`).toBe(shown);
  }
  // Every type accepts tags.
  expect(screen.getByPlaceholderText(/tag/i)).toBeTruthy();
}

describe("DocumentMetaBar shows only the fields its type carries", () => {
  it("gives an inbox item scheduling but no status — status is what triage grants", () => {
    mount("inbox");
    expectOnly("priority", "due");
  });

  it("gives a task everything it owns", () => {
    mount("task");
    expectOnly("status", "priority", "due", "reminder");
  });

  it("gives a note nothing but its tags", () => {
    mount("note");
    expectOnly();
  });

  it("gives an idea a stage instead of a status", () => {
    mount("idea");
    expectOnly("stage");
  });

  it("gives a bookmark a link and no scheduling", () => {
    mount("bookmark");
    expectOnly("url");
  });
});

describe("the type pill", () => {
  it("appears only when conversion is offered", () => {
    mount("note");
    expect(screen.queryByRole("button", { name: /change type/i })).toBeNull();
    cleanup();

    mount("note", {}, () => {});
    expect(screen.getByRole("button", { name: /change type/i })).toBeTruthy();
  });

  it("names the conversion the way the type does", () => {
    mount("inbox", {}, () => {});
    expect(screen.getByRole("button", { name: /triage/i })).toBeTruthy();
    cleanup();

    mount("idea", {}, () => {});
    expect(screen.getByRole("button", { name: /promote/i })).toBeTruthy();
  });

  it("offers only the targets the type converts to, plus itself", () => {
    mount("idea", {}, () => {});
    // Idea promotes to task or note — not to inbox or bookmark.
    fireEvent.click(screen.getByRole("button", { name: /promote/i }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Idea", "Task", "Note"]);
  });
});

describe("the bookmark link", () => {
  it("opens through the native opener", () => {
    mount("bookmark", { bookmark: { url: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Open link in browser" }));
    expect(native.openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("offers nothing to open when there is no link", () => {
    mount("bookmark");
    expect(screen.queryByRole("button", { name: "Open link in browser" })).toBeNull();
  });
});
