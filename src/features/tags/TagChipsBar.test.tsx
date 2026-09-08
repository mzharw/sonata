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
