// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DueDateField } from "./DueDateField";

afterEach(cleanup);

function mount(value: string, withTime = true) {
  const onChange = vi.fn();
  render(<DueDateField value={value} onChange={onChange} label="reminder" withTime={withTime} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose reminder" }));
  return onChange;
}

describe("picking a day", () => {
  // Choosing "tomorrow" on a 15:30 reminder must not silently drop the 15:30.
  it("keeps a time that was already set", () => {
    const onChange = mount("2026-09-10T15:30");
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T15:30$/));
  });

  it("stores the shorter date-only form when no time is set", () => {
    const onChange = mount("");
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("drops the time when the field has none to keep", () => {
    const onChange = mount("2026-09-10T15:30", false);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});

describe("picking a time", () => {
  it("keeps the day that was already chosen", () => {
    const onChange = mount("2026-09-10");
    fireEvent.change(screen.getByLabelText("Time for reminder"), { target: { value: "15:30" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-10T15:30");
  });

  // A time with no day is not a moment, so the first time picked implies today.
  it("implies today when no day has been chosen", () => {
    const onChange = mount("");
    fireEvent.change(screen.getByLabelText("Time for reminder"), { target: { value: "08:15" } });
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T08:15$/));
  });

  it("can be cleared back to a plain date, which the backend fires in the morning", () => {
    const onChange = mount("2026-09-10T15:30");
    expect(screen.queryByText("from 9:00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10");
  });

  it("says where a date-only reminder will land", () => {
    mount("2026-09-10");
    expect(screen.getByText("from 9:00")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear time" })).toBeNull();
  });
});

describe("reading a hand-written value", () => {
  it("selects the day and time from a value written with a space", () => {
    mount("2026-09-10 15:30");
    expect((screen.getByLabelText("Time for reminder") as HTMLInputElement).value).toBe("15:30");
    expect(screen.getByRole("button", { name: "Choose reminder" }).textContent).toMatch(/Sep 10.*3:30/);
  });
});
