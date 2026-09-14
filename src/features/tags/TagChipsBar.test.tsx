// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { NO_FILTERS, useUi } from "../../stores/ui";
import { TagChipsBar } from "./TagChipsBar";

vi.mock("../../lib/native", () => ({ native: { tags: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ view: "all", tag: undefined, filters: NO_FILTERS });
  vi.mocked(native.tags).mockResolvedValue([{ tag: "work", count: 2 }, { tag: "urgent", count: 1 }]);
});
afterEach(cleanup);

it("accumulates tag chips into an all-tags filter", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TagChipsBar /></QueryClientProvider>);

  await waitFor(() => expect(screen.getByRole("button", { name: "#work" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "#work" }));
  fireEvent.click(screen.getByRole("button", { name: "#urgent" }));

  expect(useUi.getState().filters).toEqual({ tags: ["work", "urgent"], sort: "default" });
});

it("turns a single-tag view into the equivalent filter", async () => {
  useUi.setState({ view: "tag", tag: "work" });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TagChipsBar /></QueryClientProvider>);

  await waitFor(() => expect(screen.getByRole("button", { name: "#urgent" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "#urgent" }));

  expect(useUi.getState()).toMatchObject({ view: "all", tag: undefined, filters: { tags: ["work", "urgent"], sort: "default" } });
});

it("keeps the bar compact and makes less-used tags searchable", async () => {
  vi.mocked(native.tags).mockResolvedValue([
    { tag: "work", count: 10 }, { tag: "urgent", count: 9 }, { tag: "home", count: 8 }, { tag: "ideas", count: 7 },
    { tag: "reading", count: 6 }, { tag: "planning", count: 5 }, { tag: "shopping", count: 4 }, { tag: "health", count: 3 },
    { tag: "vacation", count: 2 }, { tag: "finance", count: 1 },
  ]);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TagChipsBar /></QueryClientProvider>);

  await waitFor(() => expect(screen.getByRole("button", { name: /All tags/ })).toBeTruthy());
  expect(screen.queryByRole("button", { name: "#vacation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /All tags/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find a tag" }), { target: { value: "vaca" } });

  expect(screen.getByRole("button", { name: /#vacation/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /#finance/ })).toBeNull();
});
