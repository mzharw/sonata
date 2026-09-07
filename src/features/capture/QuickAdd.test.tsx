// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { QuickAdd } from "./QuickAdd";

vi.mock("../../lib/native", () => ({
  native: { tags: vi.fn(), capture: vi.fn(), createDocument: vi.fn(), updateDocument: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  useUi.setState({ view: "all" });
  vi.mocked(native.tags).mockResolvedValue([
    { tag: "errand", count: 4 },
    { tag: "home", count: 7 },
  ]);
});
afterEach(cleanup);

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <QuickAdd />
    </QueryClientProvider>,
  );
  return screen.getByLabelText("Quick add") as HTMLInputElement;
}

/** `fireEvent.change` leaves the caret at 0 in jsdom; real typing puts it after the text. */
function type(input: HTMLInputElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
}

it("suggests workspace tags while a #tag is being typed", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "Buy milk #e");

  // Substring matching, same as the tag chip input elsewhere in the app.
  const options = await screen.findAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual(["#errand4", "#home7"]);

  type(input, "Buy milk #er");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["#errand4"]);
});

it("completes the highlighted tag on Enter instead of capturing a half-typed one", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "Buy milk #e");
  await screen.findAllByRole("option");
  fireEvent.keyDown(input, { key: "Enter" });

  expect(input.value).toBe("Buy milk #errand ");
  expect(native.capture).not.toHaveBeenCalled();
});

it("captures on Enter once there is nothing left to complete", async () => {
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1" } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "Buy milk #errand");
  fireEvent.keyDown(input, { key: "Enter" });

  // Capture defaults to Inbox, which is the Rust default too, so no prefix is needed —
  // plain capture no longer silently files everything as a note.
  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("Buy milk #errand"));
});

it("offers the @due: scaffold and then only date keywords the backend resolves", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "Buy milk @d");
  fireEvent.click(await screen.findByText("@due:"));
  expect(input.value).toBe("Buy milk @due:");

  type(input, "Buy milk @due:");
  const options = await screen.findAllByRole("option");
  expect(options.map((o) => o.textContent?.split(/\d/)[0].trim())).toContain("@due:today");
});

it("Escape dismisses the suggestions without collapsing the quick-add form", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "Buy milk #e");
  await screen.findAllByRole("option");
  fireEvent.keyDown(input, { key: "Escape" });

  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

it("focuses the capture input from anywhere on the capture hotkey, and confirms the press", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  const wrap = document.querySelector(".quick-add-input-wrap") as HTMLElement;
  expect(document.activeElement).not.toBe(input);
  expect(wrap.className).not.toContain("is-hotkey-flash");

  fireEvent.keyDown(window, { key: "n", ctrlKey: true });

  expect(document.activeElement).toBe(input);
  // The flash is armed on the next frame so a repeat press restarts it.
  await waitFor(() => expect(wrap.className).toContain("is-hotkey-flash"));
  expect(native.createDocument).not.toHaveBeenCalled();
});

it("creates a note for the full-screen editor on the new-note hotkey, not a capture", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());
  vi.mocked(native.createDocument).mockResolvedValue({ id: "doc-1" } as never);

  fireEvent.keyDown(window, { key: "N", ctrlKey: true, shiftKey: true });

  await waitFor(() => expect(native.createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "note" })));
  expect(document.activeElement).not.toBe(input);
});

it("advertises the capture hotkey while the input is empty and idle", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  expect(screen.getByText(/Ctrl\+N|⌘N/)).toBeTruthy();

  // It steps aside once the field is in use, so it never competes with "Enter to add".
  type(input, "Buy milk");
  expect(screen.queryByText(/Ctrl\+N|⌘N/)).toBeNull();
});

it("lets a typed type keyword override the default type rather than burying it in the title", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1" } as never);

  type(input, "task Buy milk");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(input, { key: "Enter" });

  // Not "note task Buy milk" — the default type stands down for an explicit word.
  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("task Buy milk"));
});

it("still offers type keywords under the default type", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "ta");

  const options = await screen.findAllByRole("option");
  expect(options.map((o) => o.textContent)).toContain("tasktype");
});

it("shows the complete shorthand reference with Ctrl+Space", async () => {
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: " ", code: "Space", ctrlKey: true });

  expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(expect.arrayContaining(["tasktype", "#tagtag", "@due:YYYY-MM-DDdue date"]));
});

it("switches to Bookmark when a bare link is pasted, and files it as one", async () => {
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1", bookmark: { url: "https://example.com/a" } } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "https://example.com/a");
  fireEvent.keyDown(input, { key: "Enter" });

  // The URL is not the title, so the domain stands in for one.
  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("bookmark example.com"));
});

it("keeps the words around a link as its title", async () => {
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1", bookmark: { url: "https://example.com/a" } } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  // A link with prose around it is prose, so the type must not flip and the text is
  // captured verbatim rather than being turned into a bookmark.
  type(input, "read https://example.com/a later");
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("read https://example.com/a later"));
});

it("attaches the url when capture did not already carry one", async () => {
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1", contentHash: "h1" } as never);
  vi.mocked(native.updateDocument).mockResolvedValue({ id: "doc-1" } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "example.com");
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() =>
    expect(native.updateDocument).toHaveBeenCalledWith(
      expect.objectContaining({ bookmark: { url: "https://example.com" } }),
      "h1",
    ),
  );
});

it("does not override a type the user picked by hand", async () => {
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1" } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  // The option's handler sits on the button inside the `role="option"` li.
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
  type(input, "https://example.com/a");
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("note https://example.com/a"));
});

it("lets the view-implied type win over a pasted link", async () => {
  useUi.setState({ view: "tasks" });
  vi.mocked(native.capture).mockResolvedValue({ id: "doc-1" } as never);
  const input = mount();
  await waitFor(() => expect(native.tags).toHaveBeenCalled());

  type(input, "https://example.com/a");
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(native.capture).toHaveBeenCalledWith("task https://example.com/a"));
});
