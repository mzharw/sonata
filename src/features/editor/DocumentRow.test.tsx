// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentRow } from "./DocumentRow";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import type { DocumentSummary, DocumentType } from "../../types/domain";

vi.mock("../../lib/native", () => ({
  native: { tags: vi.fn(), readDocument: vi.fn(), backlinks: vi.fn(), openExternal: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), trash: vi.fn(), createDocument: vi.fn(), updateDocument: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ expandedId: undefined, contextMenu: undefined });
  vi.mocked(native.tags).mockResolvedValue([]);
  vi.mocked(native.backlinks).mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const summary = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: "01ABC",
  path: "inbox/x.md",
  type: "inbox",
  title: "Sort me out",
  tags: [],
  created: "",
  updated: "",
  archived: false,
  pinned: false,
  childCount: 0,
  completedChildCount: 0,
  ...over,
});

function mount(over: Partial<DocumentSummary> = {}) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ul>
        <DocumentRow doc={summary(over)} isActive={false} onAcknowledge={() => {}} onToggleComplete={() => {}} onTogglePin={() => {}} onUpdateStatus={() => {}} />
      </ul>
    </QueryClientProvider>,
  );
}

describe("the row's leading affordance", () => {
  it("gives a task a completion checkbox", () => {
    mount({ type: "task", status: "todo" });
    expect(screen.getByRole("button", { name: "Mark as completed" })).toBeTruthy();
  });

  it("offers restore rather than archive for archived documents", () => {
    mount({ archived: true });
    expect(screen.getByRole("button", { name: "Restore from archive" })).toBeTruthy();
  });

  it("gives every other type a static type glyph, titled with its label", () => {
    for (const type of ["inbox", "note", "idea", "bookmark"] as DocumentType[]) {
      mount({ type });
      expect(screen.queryByRole("button", { name: /Mark as/ })).toBeNull();
      cleanup();
    }
  });
});

describe("the row context menu", () => {
  it("offers the complete document action set", () => {
    mount({ type: "task" });
    fireEvent.contextMenu(screen.getByText("Sort me out"));
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "New subtask" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeTruthy();
  });

  it("closes when the user clicks outside it", () => {
    mount({ type: "task" });
    fireEvent.contextMenu(screen.getByText("Sort me out"));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("replaces another row's menu instead of stacking menus", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <DocumentRow doc={summary({ id: "first", title: "First" })} isActive={false} onAcknowledge={() => {}} onToggleComplete={() => {}} onTogglePin={() => {}} onUpdateStatus={() => {}} />
          <DocumentRow doc={summary({ id: "second", title: "Second" })} isActive={false} onAcknowledge={() => {}} onToggleComplete={() => {}} onTogglePin={() => {}} onUpdateStatus={() => {}} />
        </ul>
      </QueryClientProvider>,
    );

    fireEvent.contextMenu(screen.getByText("First"));
    fireEvent.contextMenu(screen.getByText("Second"));

    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });
});

describe("the row's meta chips", () => {
  it("keeps priority with tags when no due date or reminder is set", () => {
    mount({ type: "task", tags: ["feature"], priority: "urgent" });
    expect(screen.getByText("urgent").className).not.toContain("separated");
  });

  it("separates priority after scheduled metadata", () => {
    mount({ type: "task", due: "2026-02-01", priority: "urgent" });
    expect(screen.getByText("urgent").className).toContain("separated");
  });

  it("keeps priority with the due date and reminder", () => {
    mount({ type: "task", due: "2026-02-01", reminder: "2026-02-01T09:00", priority: "urgent" });
    expect(screen.getByText("urgent").className).not.toContain("separated");
  });

  it("uses styled tooltips for scheduled metadata", () => {
    mount({ type: "task", due: "2026-02-01", reminder: "2026-02-01T09:00" });
    expect(screen.getByRole("tooltip", { name: "Due 2026-02-01" })).toBeTruthy();
    expect(screen.getByRole("tooltip", { name: /Reminder/ })).toBeTruthy();
    expect(document.querySelector('[title="Due 2026-02-01"]')).toBeNull();
  });

  it("shows a task its progress and due date", () => {
    mount({ type: "task", due: "2026-02-01", childCount: 3, completedChildCount: 1 });
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByRole("tooltip", { name: "Due 2026-02-01" })).toBeTruthy();
  });

  // The chips a row shows are the type's business, so legacy frontmatter on a note stops
  // advertising fields the note no longer owns. Its indexed edit time is browse context,
  // rather than persisted note metadata, so it remains available alongside tags.
  it("shows a note its tags and last edit, but no task metadata", () => {
    mount({ type: "note", tags: ["work"], updated: new Date().toISOString(), due: "2026-02-01", priority: "high" });
    expect(screen.getByText("#work")).toBeTruthy();
    expect(screen.getByText("Edited just now")).toBeTruthy();
    expect(screen.queryByTitle("2026-02-01")).toBeNull();
    expect(screen.queryByText(/high/)).toBeNull();
  });

  it("omits a note's edit label when its timestamp is malformed", () => {
    mount({ type: "note", updated: "not-a-date" });
    expect(screen.queryByText(/^Edited /)).toBeNull();
  });

  it("shows a bookmark its domain, and offers to open it", () => {
    mount({ type: "bookmark", bookmark: { url: "https://www.example.com/a" } });
    expect(screen.getByText("example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open link in browser" }));
    expect(native.openExternal).toHaveBeenCalledWith("https://www.example.com/a");
  });

  it("shows an idea its stage", () => {
    mount({ type: "idea", stage: "developing" });
    expect(screen.getByText("Developing")).toBeTruthy();
  });

  it("counts children only for a type with subtasks", () => {
    // A converted parent keeps its children by design (ADR-004), so the count can be
    // non-zero for a note — the spec decides whether to show it, not the count.
    mount({ type: "note", childCount: 3, completedChildCount: 1 });
    expect(screen.queryByText("1/3")).toBeNull();
  });
});

describe("the row hover preview", () => {
  it("opens a wiki link's referenced document instead of its previewing row", async () => {
    const targetId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    vi.mocked(native.readDocument).mockResolvedValue({ ...summary({ type: "note" }), body: `[[Referenced note|${targetId}]]` } as never);
    mount({ type: "note" });

    fireEvent.mouseEnter(screen.getByText("Sort me out"));
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const link = await waitFor(() => screen.getByRole("link", { name: "Referenced note" }));
    fireEvent.click(link);

    expect(useUi.getState().expandedId).toBe(targetId);
  });
});

describe("the row's conversion verb", () => {
  it("calls an inbox conversion Triage", () => {
    mount({ type: "inbox" });
    expect(screen.getByRole("button", { name: /^Triage /i })).toBeTruthy();
  });

  it("calls an idea conversion Promote", () => {
    mount({ type: "idea" });
    expect(screen.getByRole("button", { name: /^Promote /i })).toBeTruthy();
  });

  it("offers an inbox item every other type", () => {
    mount({ type: "inbox" });
    fireEvent.click(screen.getByRole("button", { name: /^Triage /i }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Inbox",
      "Task",
      "Note",
      "Idea",
      "Bookmark",
    ]);
  });
});

describe("the row's status action", () => {
  it("offers a status only for a type that carries one", () => {
    mount({ type: "task" });
    expect(screen.getByRole("button", { name: "Status" })).toBeTruthy();
    cleanup();

    mount({ type: "bookmark" });
    expect(screen.queryByRole("button", { name: "Status" })).toBeNull();
  });
});
