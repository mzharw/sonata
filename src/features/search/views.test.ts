import { describe, expect, it } from "vitest";
import { queryFor, sections } from "./views";

describe("queryFor", () => {
  // The old implementation depluralized the view name with `slice(0, -1)`, which happened
  // to work for "tasks"/"notes"/"ideas" and for "bookmarks" only by luck.
  it("maps each type view to its type", () => {
    expect(queryFor("inbox")).toEqual({ type: "inbox" });
    expect(queryFor("tasks")).toEqual({ type: "task" });
    expect(queryFor("notes")).toEqual({ type: "note" });
    expect(queryFor("ideas")).toEqual({ type: "idea" });
    expect(queryFor("bookmarks")).toEqual({ type: "bookmark" });
  });

  it("leaves a mixed list untyped", () => {
    expect(queryFor("all")).toEqual({});
  });

  it("routes the status views through whichever type owns them", () => {
    expect(queryFor("today")).toEqual({ type: "task", due: "today" });
    expect(queryFor("upcoming")).toEqual({ type: "task", due: "upcoming" });
    expect(queryFor("completed")).toEqual({ type: "task", status: "completed" });
  });

  it("handles archive and tag views", () => {
    expect(queryFor("archive")).toEqual({ archived: true });
    expect(queryFor("tag", "work")).toEqual({ tag: "work" });
  });

  // No `sort` is ever sent: "default" resolves per type in Rust, from the same spec.
  it("never pins a sort order", () => {
    for (const [view] of sections) expect(queryFor(view).sort).toBeUndefined();
  });
});

describe("sections", () => {
  it("labels each type view with its plural", () => {
    expect(sections.find(([v]) => v === "tasks")?.[1]).toBe("Tasks");
    expect(sections.find(([v]) => v === "bookmarks")?.[1]).toBe("Bookmarks");
    expect(sections.find(([v]) => v === "inbox")?.[1]).toBe("Inbox");
  });

  it("groups type views separately from status views", () => {
    const groups = new Map(sections.map(([view, , , group]) => [view, group]));
    expect(groups.get("notes")).toBe("type");
    expect(groups.get("today")).toBe("status");
  });
});
