import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { native } from "./native";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("workspace selection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("opens the selected folder with the registered backend command", async () => {
    vi.mocked(open).mockResolvedValue("/notes");
    await expect(native.chooseWorkspace()).resolves.toBe("/notes");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, multiple: false }));
    expect(invoke).toHaveBeenCalledExactlyOnceWith("open_workspace", { path: "/notes" });
  });

  it("leaves the workspace alone when the picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(native.chooseWorkspace()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("propagates open failures for display in the UI", async () => {
    vi.mocked(open).mockResolvedValue("/notes");
    vi.mocked(invoke).mockRejectedValue("Permission denied");
    await expect(native.chooseWorkspace()).rejects.toBe("Permission denied");
  });
});
