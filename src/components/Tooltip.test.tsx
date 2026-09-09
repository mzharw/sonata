// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleTooltipProvider } from "./Tooltip";

afterEach(cleanup);

describe("TitleTooltipProvider", () => {
  it("replaces an HTML title with the styled tooltip on hover", () => {
    render(<TitleTooltipProvider><button title="Open settings">Settings</button></TitleTooltipProvider>);

    const button = screen.getByRole("button", { name: "Settings" });
    fireEvent.pointerOver(button);

    expect(screen.getByRole("tooltip", { name: "Open settings" })).toBeTruthy();
    expect(button.getAttribute("title")).toBeNull();
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("also shows the tooltip for keyboard focus", () => {
    render(<TitleTooltipProvider><button title="Open settings">Settings</button></TitleTooltipProvider>);
    fireEvent.focus(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("tooltip", { name: "Open settings" })).toBeTruthy();
  });

  it("flips and clamps a tooltip that would cross the viewport edge", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("tooltip")) return { width: 160, top: -30 } as DOMRect;
      return { left: 0, width: 20, top: 4, bottom: 24 } as DOMRect;
    });
    render(<TitleTooltipProvider><button title="Open settings">Settings</button></TitleTooltipProvider>);

    fireEvent.pointerOver(screen.getByRole("button", { name: "Settings" }));

    const tooltip = screen.getByRole("tooltip", { name: "Open settings" });
    expect(tooltip.className).toContain("below");
    expect(tooltip.getAttribute("style")).toContain("left: 88px");
    bounds.mockRestore();
  });
});
