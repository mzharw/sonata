import { describe, expect, it } from "vitest";
import { documentAttention } from "./attention";
import type { DocumentSummary } from "../types/domain";

const doc = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: "01ABC", path: "tasks/x.md", type: "task", title: "Call back", tags: [], created: "", updated: "", archived: false, pinned: false, status: "todo", childCount: 0, completedChildCount: 0, ...over,
});
const now = new Date(2026, 8, 8, 9, 0);

describe("documentAttention", () => {
  it("marks overdue and today due dates, but not future ones", () => {
    expect(documentAttention(doc({ due: "2026-09-07" }), now)?.labels).toEqual(["Overdue"]);
    expect(documentAttention(doc({ due: "2026-09-08" }), now)?.labels).toEqual(["Due today"]);
    expect(documentAttention(doc({ due: "2026-09-09" }), now)).toBeUndefined();
  });

  it("marks reminders within thirty minutes or passed, including date-only reminders at 9am", () => {
    expect(documentAttention(doc({ reminder: "2026-09-08T09:30" }), now)?.labels).toEqual(["Reminder in 30 min"]);
    expect(documentAttention(doc({ reminder: "2026-09-08T09:31" }), now)).toBeUndefined();
    expect(documentAttention(doc({ reminder: "2026-09-08T08:59" }), now)?.labels).toEqual(["Reminder missed"]);
    expect(documentAttention(doc({ reminder: "2026-09-08" }), now)?.labels).toEqual(["Reminder missed"]);
  });

  it("suppresses matching acknowledgements and re-arms changed values", () => {
    expect(documentAttention(doc({ due: "2026-09-08", acknowledgedDue: "2026-09-08" }), now)).toBeUndefined();
    expect(documentAttention(doc({ due: "2026-09-08", acknowledgedDue: "2026-09-07" }), now)?.labels).toEqual(["Due today"]);
  });

  it("ignores closed items and invalid values", () => {
    expect(documentAttention(doc({ status: "completed", due: "2026-09-07" }), now)).toBeUndefined();
    expect(documentAttention(doc({ reminder: "not-a-date" }), now)).toBeUndefined();
  });
});
