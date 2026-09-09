export type Theme = "system" | "light" | "dark";
export type Accent = "green" | "blue" | "violet" | "amber";
export type Density = "comfortable" | "compact";
export type Motion = "system" | "reduced";

export interface ShortcutPreferences { search: string; palette: string; capture: string; newNote: string }
export interface Preferences {
  version: number;
  theme: Theme;
  accent: Accent;
  density: Density;
  motion: Motion;
  hoverEnabled: boolean;
  autoHide: boolean;
  hoverDelayMs: 150 | 250 | 500;
  pauseHoverFullscreen: boolean;
  showTags: boolean;
  showQuickAdd: boolean;
  panelShortcut: string | null;
  shortcuts: ShortcutPreferences;
  panelWidth?: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1, theme: "system", accent: "green", density: "comfortable", motion: "system",
  hoverEnabled: true, autoHide: true, hoverDelayMs: 250, pauseHoverFullscreen: false,
  showTags: true, showQuickAdd: true, panelShortcut: null,
  shortcuts: { search: "Alt+S", palette: "Alt+K", capture: "CmdOrCtrl+N", newNote: "CmdOrCtrl+Shift+N" },
};

export function shortcutLabel(shortcut: string) {
  const mac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
  return shortcut.replace("CmdOrCtrl", mac ? "⌘" : "Ctrl").replaceAll("+", mac ? "" : "+");
}

type ShortcutEvent = Pick<KeyboardEvent, "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey">;

export function matchesShortcut(event: ShortcutEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.at(-1);
  const mac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
  const wantsPrimary = parts.includes("cmdorctrl") || parts.includes(mac ? "cmd" : "ctrl");
  return event.key.toLowerCase() === key
    && event.altKey === parts.includes("alt")
    && event.shiftKey === parts.includes("shift")
    && (event.ctrlKey || event.metaKey) === wantsPrimary;
}

export function shortcutFromEvent(event: ShortcutEvent) {
  if (["Control", "Meta", "Alt", "Shift"].includes(event.key) || event.key.length !== 1) return null;
  const parts = [event.ctrlKey || event.metaKey ? "CmdOrCtrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.key.toUpperCase()].filter(Boolean);
  return parts.join("+");
}
