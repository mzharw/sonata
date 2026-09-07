// Single source for the app's global shortcuts, so the key handlers and the
// <kbd> hints that advertise them can never drift apart.

export const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

export const PALETTE_HOTKEY = IS_MAC ? "⌥K" : "Alt+K";
/** Focuses the quick-add input. */
export const CAPTURE_HOTKEY = IS_MAC ? "⌘N" : "Ctrl+N";
/** Creates a note and opens it in the full-screen editor. */
export const NEW_NOTE_HOTKEY = IS_MAC ? "⇧⌘N" : "Ctrl+Shift+N";

/** True when the event carries the platform's primary modifier. */
export const hasMod = (event: KeyboardEvent) => (IS_MAC ? event.metaKey : event.ctrlKey);
