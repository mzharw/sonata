import { useEffect, type RefObject } from "react";

/** Dismiss a floating surface unless the event belongs to its trigger or any portalled content. */
export function useDismiss(open: boolean, onClose: () => void, ...refs: Array<RefObject<HTMLElement | null>>) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!refs.some((ref) => ref.current?.contains(e.target as Node))) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Floating UI owns the first Escape. This prevents parent keyboard shortcuts from
        // closing an editor or panel while the user is only dismissing its child surface.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
