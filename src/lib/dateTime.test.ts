import { describe, expect, it } from "vitest";
import { formatDateTime, formatTime, joinDateTime, splitDateTime, todayISO } from "./dateTime";

describe("splitDateTime", () => {
  it("splits a stored datetime", () => {
    expect(splitDateTime("2026-09-10T15:30")).toEqual({ date: "2026-09-10", time: "15:30" });
  });

  it("reports no time for a date-only value", () => {
    expect(splitDateTime("2026-09-10")).toEqual({ date: "2026-09-10", time: "" });
  });

  // As generous as the Rust parser, so a hand-written value survives the editor.
  it("accepts the shapes a person might hand-write", () => {
    expect(splitDateTime("2026-09-10 15:30")).toEqual({ date: "2026-09-10", time: "15:30" });
    expect(splitDateTime("2026-09-10T15:30:45")).toEqual({ date: "2026-09-10", time: "15:30" });
    expect(splitDateTime("  2026-09-10  ")).toEqual({ date: "2026-09-10", time: "" });
  });

  it("yields nothing for a value it cannot read", () => {
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(splitDateTime("next tuesday")).toEqual({ date: "", time: "" });
  });
});

describe("joinDateTime", () => {
  it("writes the shorter form when there is no time", () => {
    expect(joinDateTime("2026-09-10", "")).toBe("2026-09-10");
    expect(joinDateTime("2026-09-10", "15:30")).toBe("2026-09-10T15:30");
  });

  // A time with no day is not a moment, so it is not a reminder.
  it("yields nothing without a date", () => {
    expect(joinDateTime("", "15:30")).toBe("");
    expect(joinDateTime("", "")).toBe("");
  });

  it("round-trips through splitDateTime", () => {
    for (const value of ["2026-09-10", "2026-09-10T15:30", "2026-12-31T00:00"]) {
      const { date, time } = splitDateTime(value);
      expect(joinDateTime(date, time)).toBe(value);
    }
  });
});

describe("formatTime", () => {
  it("renders a 24h value in the reader's locale", () => {
    expect(formatTime("15:30")).toMatch(/3:30/);
    expect(formatTime("09:05")).toMatch(/9:05/);
  });

  it("passes through anything it cannot read", () => {
    expect(formatTime("nope")).toBe("nope");
  });
});

describe("formatDateTime", () => {
  it("names the day, and the time only when one was set", () => {
    expect(formatDateTime("2026-09-10")).toMatch(/Sep 10/);
    expect(formatDateTime("2026-09-10")).not.toMatch(/:/);
    expect(formatDateTime("2026-09-10T15:30")).toMatch(/Sep 10.*3:30/);
  });

  it("is empty for an unreadable value, so the placeholder shows instead", () => {
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("someday")).toBe("");
  });
});

describe("todayISO", () => {
  it("formats a local date without drifting across timezones", () => {
    // A UTC-based formatter would report the 9th for a late-evening local time.
    expect(todayISO(new Date(2026, 8, 10, 23, 30))).toBe("2026-09-10");
    expect(todayISO(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});
