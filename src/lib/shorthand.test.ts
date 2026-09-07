import { describe, expect, it } from "vitest";
import { applyShorthandSuggestion, isoDate, shorthandSuggestions } from "./shorthand";

const TAGS = [
  { tag: "errand", count: 4 },
  { tag: "errands-weekly", count: 1 },
  { tag: "home", count: 7 },
];

/** Fixed so the relative date labels don't drift with the wall clock. */
const TODAY = new Date(2026, 8, 6);

function suggest(text: string, caret = text.length, offerTypes = true) {
  return shorthandSuggestions(text, caret, TAGS, { offerTypes, today: TODAY });
}

describe("shorthandSuggestions", () => {
  it("completes a #tag from the tags already in the workspace", () => {
    const match = suggest("Buy milk #err");
    expect(match?.start).toBe(9);
    expect(match?.items.map((i) => i.insert)).toEqual(["#errand", "#errands-weekly"]);
  });

  it("offers every tag on a bare #, with its usage count as the hint", () => {
    expect(suggest("Buy milk #")?.items).toEqual([
      { insert: "#errand", label: "#errand", hint: "4" },
      { insert: "#errands-weekly", label: "#errands-weekly", hint: "1" },
      { insert: "#home", label: "#home", hint: "7" },
    ]);
  });

  it("does not re-offer a tag already written earlier in the same capture", () => {
    expect(suggest("Buy milk #home #h")).toBeNull();
    expect(suggest("Buy milk #home #")?.items.map((i) => i.insert)).toEqual(["#errand", "#errands-weekly"]);
  });

  it("stops suggesting once the token spells out its only completion, so Enter submits", () => {
    expect(suggest("Buy milk #home")).toBeNull();
  });

  it("scaffolds @due: and leaves the caret inside it", () => {
    const match = suggest("Buy milk @d");
    expect(match?.items).toEqual([{ insert: "@due:", label: "@due:", hint: "due date", space: false }]);
    expect(match?.items[0].space).toBe(false);
  });

  it("offers only date keywords the Rust parser can actually resolve", () => {
    expect(suggest("Buy milk @due:")?.items.map((i) => i.insert)).toEqual([
      "@due:today",
      "@due:tomorrow",
      "@due:yesterday",
      "@due:2026-09-13",
    ]);
  });

  it("filters date keywords by what has been typed and resolves them in the hint", () => {
    expect(suggest("Buy milk @due:tom")?.items).toEqual([
      { insert: "@due:tomorrow", label: "@due:tomorrow", hint: "2026-09-07" },
    ]);
  });

  it("offers a type keyword only as the first word", () => {
    expect(suggest("ta")?.items.map((i) => i.insert)).toEqual(["task"]);
    expect(suggest("Buy ta")).toBeNull();
  });

  it("stays out of the way when the type is already pinned by the dropdown or view", () => {
    expect(suggest("ta", 2, false)).toBeNull();
  });

  it("suggests nothing for ordinary title text", () => {
    expect(suggest("Buy milk")).toBeNull();
  });

  it("completes the token under the caret, not the end of the line", () => {
    const text = "Buy #err @due:today";
    const match = suggest(text, 8);
    expect(match?.start).toBe(4);
    expect(match?.items.map((i) => i.insert)).toEqual(["#errand", "#errands-weekly"]);
  });
});

describe("applyShorthandSuggestion", () => {
  it("replaces the token in place and leaves the caret past a trailing space", () => {
    const result = applyShorthandSuggestion("Buy milk #err", 9, 13, { insert: "#errand", label: "#errand" });
    expect(result).toEqual({ text: "Buy milk #errand ", caret: 17 });
  });

  it("keeps the rest of the line intact when completing mid-text", () => {
    const result = applyShorthandSuggestion("Buy #err @due:today", 4, 8, { insert: "#errand", label: "#errand" });
    // The space before "@due:" is reused rather than doubled, and the caret lands past it.
    expect(result).toEqual({ text: "Buy #errand @due:today", caret: 12 });
  });

  it("does not append a space after a scaffold the user keeps typing into", () => {
    const result = applyShorthandSuggestion("Buy @d", 4, 6, { insert: "@due:", label: "@due:", space: false });
    expect(result).toEqual({ text: "Buy @due:", caret: 9 });
  });
});

describe("isoDate", () => {
  it("offsets in local time without tripping over month ends", () => {
    expect(isoDate(0, new Date(2026, 8, 30))).toBe("2026-09-30");
    expect(isoDate(1, new Date(2026, 8, 30))).toBe("2026-10-01");
    expect(isoDate(-1, new Date(2026, 0, 1))).toBe("2025-12-31");
  });
});
