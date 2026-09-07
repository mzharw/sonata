// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi, NO_FILTERS } from "../../stores/ui";
import { FilterMenu } from "./FilterMenu";
import { DocumentList } from "../editor/DocumentList";

vi.mock("../../lib/native", () => ({ native: { listDocuments: vi.fn(), tags: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ view: "all", tag: undefined, filters: NO_FILTERS });
  vi.mocked(native.listDocuments).mockResolvedValue([]);
});
afterEach(cleanup);

function mount(ui: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByLabelText(/Filter and sort/));
}

it("records a chosen status and priority without touching the sort", () => {
  mount(<FilterMenu />);
  openMenu();

  fireEvent.click(screen.getByRole("menuitemradio", { name: /In progress/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Urgent/ }));

  expect(useUi.getState().filters).toEqual({ status: "in_progress", priority: "urgent", sort: "default" });
});

it("badges the trigger with how many filters are narrowing the list, but not the sort", () => {
  mount(<FilterMenu />);
  openMenu();

  fireEvent.click(screen.getByRole("menuitemradio", { name: /Title A–Z/ }));
  expect(screen.queryByText("1")).toBeNull();

  fireEvent.click(screen.getByRole("menuitemradio", { name: /^High/ }));
  expect(screen.getByText("1")).toBeTruthy();
});

it("clears back to the defaults on reset", () => {
  useUi.setState({ filters: { status: "todo", priority: "high", sort: "title" } });
  mount(<FilterMenu />);
  openMenu();

  fireEvent.click(screen.getByText("Reset to defaults"));

  expect(useUi.getState().filters).toEqual(NO_FILTERS);
});

it("sends the filters to the native query, letting them refine the current view", async () => {
  useUi.setState({ view: "completed", filters: { status: "todo", priority: "low", sort: "priority" } });
  mount(<DocumentList search="" />);

  await waitFor(() => expect(native.listDocuments).toHaveBeenCalled());
  // The view contributes type: task and status: completed; the chosen status wins.
  expect(native.listDocuments).toHaveBeenCalledWith({
    type: "task",
    status: "todo",
    priority: "low",
    sort: "priority",
    text: undefined,
  });
});

it("says the filters are the reason the list is empty, and offers a way out", async () => {
  useUi.setState({ filters: { priority: "urgent", sort: "default" } });
  mount(<DocumentList search="" />);

  await waitFor(() => expect(screen.getByText("No items match the current filters.")).toBeTruthy());
  fireEvent.click(screen.getByText("Clear filters"));
  expect(useUi.getState().filters).toEqual(NO_FILTERS);
});
