import { expect, it } from "vitest";
import { relativeTime, absoluteDate, exactTimestamp } from "./formatTimestamp";

const NOW = new Date("2026-09-06T12:00:00+07:00").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

it("describes recent edits in the coarsest useful unit", () => {
  expect(relativeTime(ago(10_000), NOW)).toBe("just now");
  expect(relativeTime(ago(14 * 60_000), NOW)).toBe("14m ago");
  expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3h ago");
  expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe("2d ago");
});

it("falls back to a date once the relative form stops being informative", () => {
  expect(relativeTime(ago(30 * 86_400_000), NOW)).toBe(absoluteDate(ago(30 * 86_400_000), NOW));
});

it("reads a document written a moment ahead of us as 'just now', not a negative age", () => {
  // Clock skew between the file's timestamp and this machine is normal.
  expect(relativeTime(new Date(NOW + 30_000).toISOString(), NOW)).toBe("just now");
});

it("drops the year only while it matches the current one", () => {
  expect(absoluteDate("2026-09-03T09:00:00+07:00", NOW)).not.toMatch(/2026/);
  expect(absoluteDate("2024-09-03T09:00:00+07:00", NOW)).toMatch(/2024/);
});

it("returns empty rather than 'Invalid Date' for unparseable input", () => {
  expect(relativeTime("not-a-date", NOW)).toBe("");
  expect(absoluteDate("not-a-date", NOW)).toBe("");
  expect(exactTimestamp("not-a-date")).toBe("");
});
