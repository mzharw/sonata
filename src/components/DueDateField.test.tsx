// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T15:30$/));
  });

  it("stores the shorter date-only form when no time is set", () => {
    const onChange = mount("");
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
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
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "15" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Minute" })).getByRole("option", { name: "30" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T15:30");
  });

  it("does not allow a time before a day has been chosen", () => {
    const onChange = mount("");
    expect((within(screen.getByRole("listbox", { name: "Minute" })).getByRole("option", { name: "15" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can be cleared back to a plain date, which the backend fires in the morning", () => {
    const onChange = mount("2026-09-10T15:30");
    expect(screen.queryByText("No time set")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear time" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10");
  });

  it("shows 00:00 in the picker without assigning a time to a date-only reminder", () => {
    mount("2026-09-10");
    expect(screen.getByLabelText("Time for reminder").textContent).toBe("00:00");
    expect(screen.queryByRole("button", { name: "Clear time" })).toBeNull();
  });

  it("uses 00 minutes when an hour is chosen first", () => {
    const onChange = mount("2026-09-10");
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "08" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T08:00");
  });

  it("keeps the selected minute when changing the hour", () => {
    const onChange = mount("2026-09-10T08:15");
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "09" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T09:15");
  });

  it("stays open while an hour or minute grid is scrolled", () => {
    mount("2026-09-10");
    fireEvent.scroll(screen.getByRole("listbox", { name: "Minute" }));
    expect(screen.getByRole("listbox", { name: "Hour" })).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Minute" })).toBeTruthy();
  });

  it("can be closed with Done after choosing a date and time", () => {
    const onChange = mount("2026-09-10");
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hour" })).getByRole("option", { name: "08" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T08:00");
    expect(screen.queryByRole("dialog", { name: "Choose reminder" })).toBeNull();
  });

  it("warns and prevents committing a past reminder", () => {
    const now = new Date();
    const past = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1, now.getMinutes());
    const value = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}T${String(past.getHours()).padStart(2, "0")}:${String(past.getMinutes()).padStart(2, "0")}`;
    const onChange = mount(value);
    expect(screen.getByRole("alert").textContent).toMatch(/future reminder time/i);
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const OPTION_HEIGHT = 30;
const WHEEL_HEIGHT = 150;
const EMPTY_RECT = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;

// jsdom does no layout, so the wheels and their options are given a measurable
// geometry: option `i` sits at `i * OPTION_HEIGHT`, scrolled by the wheel.
function stubWheelLayout() {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  const realClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  const isWheel = (el: Element | null) => el?.getAttribute("role") === "listbox";
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (isWheel(this)) return { ...EMPTY_RECT, height: WHEEL_HEIGHT, bottom: WHEEL_HEIGHT };
    const wheel = this.parentElement;
    if (!isWheel(wheel)) return EMPTY_RECT;
    const top = Array.prototype.indexOf.call(wheel!.children, this) * OPTION_HEIGHT - wheel!.scrollTop;
    return { ...EMPTY_RECT, top, bottom: top + OPTION_HEIGHT, height: OPTION_HEIGHT };
  };
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isWheel(this) ? WHEEL_HEIGHT : 0;
    },
  });
  return () => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
    if (realClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", realClientHeight);
  };
}

/** Where the wheel must be scrolled for `index` of the middle copy to sit centred. */
function centredScrollTop(index: number, length: number) {
  return (2 * length + index) * OPTION_HEIGHT - (WHEEL_HEIGHT - OPTION_HEIGHT) / 2;
}

describe("opening the time wheels", () => {
  let restoreLayout = () => {};
  beforeEach(() => {
    restoreLayout = stubWheelLayout();
  });
  afterEach(() => restoreLayout());

  it("scrolls the chosen hour and minute to the middle", () => {
    mount("2026-09-10T15:30");
    expect(screen.getByRole("listbox", { name: "Hour" }).scrollTop).toBe(centredScrollTop(15, 24));
    expect(screen.getByRole("listbox", { name: "Minute" }).scrollTop).toBe(centredScrollTop(30, 60));
  });

  // The wheels repeat, so even 00:00 has to start in the middle copy: opening at the
  // very top would leave the user unable to scroll up.
  it("starts in the middle copy when no time is set yet", () => {
    mount("2026-09-10");
    expect(screen.getByRole("listbox", { name: "Hour" }).scrollTop).toBe(centredScrollTop(0, 24));
    expect(screen.getByRole("listbox", { name: "Minute" }).scrollTop).toBe(centredScrollTop(0, 60));
  });

  it("leaves the wheel where the user left it when a new hour is clicked", () => {
    mount("2026-09-10T15:30");
    const hours = screen.getByRole("listbox", { name: "Hour" });
    hours.scrollTop = 900;
    fireEvent.click(within(hours).getByRole("option", { name: "09" }));
    expect(hours.scrollTop).toBe(900);
  });
});

describe("reading a hand-written value", () => {
  it("selects the day and time from a value written with a space", () => {
    mount("2026-09-10 15:30");
    expect(screen.getByLabelText("Time for reminder").textContent).toBe("15:30");
    expect(screen.getByRole("button", { name: "Choose reminder" }).textContent).toMatch(/Sep 10.*3:30/);
  });
});
