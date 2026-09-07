// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { native } from "../lib/native";
import { WorkspaceGate } from "./WorkspaceGate";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("../lib/native", () => ({ native: { listDocuments: vi.fn(), chooseWorkspace: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function mount() {
  render(<QueryClientProvider client={new QueryClient()}>
    <WorkspaceGate><button>Add note</button></WorkspaceGate>
  </QueryClientProvider>);
}

it("explains browser limitations without calling native commands", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  mount();
  expect(screen.getByText("Open Sonata on your desktop")).toBeTruthy();
  expect(screen.queryByText("Add note")).toBeNull();
  expect(native.listDocuments).not.toHaveBeenCalled();
});

it("unlocks the app after choosing a workspace", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(native.listDocuments).mockRejectedValueOnce("Choose a workspace first").mockResolvedValue([]);
  vi.mocked(native.chooseWorkspace).mockResolvedValue("/notes");
  mount();
  fireEvent.click(await screen.findByText("Choose workspace…"));
  expect(await screen.findByText("Add note")).toBeTruthy();
});

it("shows picker failures and keeps workspace selection available", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(native.listDocuments).mockRejectedValue("Choose a workspace first");
  vi.mocked(native.chooseWorkspace).mockRejectedValue("Permission denied");
  mount();
  fireEvent.click(await screen.findByText("Choose workspace…"));
  expect((await screen.findByRole("alert")).textContent).toBe("Permission denied");
  expect(screen.queryByText("Add note")).toBeNull();
});

it("says what it is doing while the workspace is still opening", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(native.listDocuments).mockReturnValue(new Promise(() => {}));
  mount();
  expect((await screen.findByRole("status")).textContent).toContain("Reading notes from disk");
  expect(screen.queryByText("Choose workspace…")).toBeNull();
});

it("surfaces a real workspace failure but stays quiet about the ordinary first run", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(native.listDocuments).mockRejectedValue("The workspace is unavailable: /notes");
  mount();
  await screen.findByText("Choose workspace…");
  expect(screen.getByRole("status").textContent).toContain("/notes");

  cleanup();
  vi.mocked(native.listDocuments).mockRejectedValue("Choose or create a workspace first");
  mount();
  expect(await screen.findByText("Choose workspace…")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});
