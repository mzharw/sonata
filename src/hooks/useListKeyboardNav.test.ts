// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useListKeyboardNav } from "./useListKeyboardNav";

afterEach(cleanup);

/** The hook's handler only reads `key` and calls preventDefault. */
function press(result: { current: ReturnType<typeof useListKeyboardNav> }, key: string) {
  act(() => {
    result.current.containerProps.onKeyDown({ key, preventDefault: () => {} } as never);
  });
}

it("starts with no row selected", () => {
  const { result } = renderHook(() => useListKeyboardNav(["a", "b", "c"]));
  expect(result.current.activeId).toBeUndefined();
  expect(result.current.containerProps["aria-activedescendant"]).toBeUndefined();
});

it("enters the list from the end the first arrow press came from", () => {
  const down = renderHook(() => useListKeyboardNav(["a", "b", "c"]));
  press(down.result, "ArrowDown");
  expect(down.result.current.activeId).toBe("a");

  const up = renderHook(() => useListKeyboardNav(["a", "b", "c"]));
  press(up.result, "ArrowUp");
  expect(up.result.current.activeId).toBe("c");
});

it("returns to having nothing selected when cleared", () => {
  const { result } = renderHook(() => useListKeyboardNav(["a", "b", "c"]));
  press(result, "ArrowDown");
  press(result, "ArrowDown");
  expect(result.current.activeId).toBe("b");

  act(() => result.current.clear());
  expect(result.current.activeId).toBeUndefined();
});

it("drops the selection when its row leaves the list rather than sliding to a neighbour", () => {
  const { result, rerender } = renderHook(({ ids }) => useListKeyboardNav(ids), {
    initialProps: { ids: ["a", "b", "c"] },
  });
  press(result, "ArrowDown");
  press(result, "ArrowDown");
  expect(result.current.activeId).toBe("b");

  rerender({ ids: ["a", "c"] });
  expect(result.current.activeId).toBeUndefined();
});

it("keeps the selection when the row survives a list change", () => {
  const { result, rerender } = renderHook(({ ids }) => useListKeyboardNav(ids), {
    initialProps: { ids: ["a", "b", "c"] },
  });
  press(result, "ArrowDown");
  expect(result.current.activeId).toBe("a");

  rerender({ ids: ["a", "b"] });
  expect(result.current.activeId).toBe("a");
});
