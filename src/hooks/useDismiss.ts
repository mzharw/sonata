import { useEffect, type RefObject } from "react";

/** Dismiss a floating surface unless the event belongs to its trigger or any portalled content. */
export function useDismiss(open: boolean, onClose: () => void, ...refs: Array<RefObject<HTMLElement | null>>) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!refs.some((ref) => ref.current?.contains(e.target as Node))) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
