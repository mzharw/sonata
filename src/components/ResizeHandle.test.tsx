// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ResizeHandle } from "./ResizeHandle";

const { outerSize } = vi.hoisted(() => ({ outerSize: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ outerSize }) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.mocked(invoke).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function handle() {
  render(<ResizeHandle />);
  const element = screen.getByRole("separator");
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  return element;
}

it("applies the final position when a fast drag ends before the width lookup", async () => {
  let resolveSize!: (size: { width: number }) => void;
  outerSize.mockReturnValue(new Promise((resolve) => { resolveSize = resolve; }));
  const element = handle();
  fireEvent.pointerDown(element, { button: 0, screenX: 1000 });
  fireEvent.pointerMove(element, { screenX: 900 });
  fireEvent.pointerUp(element, { screenX: 850 });
  await act(async () => { resolveSize({ width: 760 }); });
  await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("set_sidebar_resizing", { resizing: false }));
  expect(invoke).toHaveBeenCalledWith("resize_sidebar", { width: 910 });
});

it("waits for an in-flight resize before ending and handles lost capture", async () => {
  outerSize.mockResolvedValue({ width: 760 });
  let resolveResize!: () => void;
  vi.mocked(invoke).mockImplementation((command) => command === "resize_sidebar"
    ? new Promise<void>((resolve) => { resolveResize = resolve; }) as ReturnType<typeof invoke>
    : Promise.resolve(undefined) as ReturnType<typeof invoke>);
  const element = handle();
  fireEvent.pointerDown(element, { button: 0, screenX: 1000 });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("resize_sidebar", { width: 760 }));
  fireEvent.lostPointerCapture(element);
  expect(invoke).not.toHaveBeenCalledWith("set_sidebar_resizing", { resizing: false });
  // Finish can coalesce one final width after the in-flight update.
  await act(async () => { resolveResize(); });
  await act(async () => { resolveResize(); });
  await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("set_sidebar_resizing", { resizing: false }));
});
