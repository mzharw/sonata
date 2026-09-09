import { useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

/** A compact, keyboard-accessible alternative to the browser's native title tooltip. */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tooltip-anchor" aria-describedby={id}>
      {children}
      <span className="tooltip" id={id} role="tooltip">{content}</span>
    </span>
  );
}

/**
 * Converts legacy HTML `title` attributes into Sonata tooltips. Keeping this delegated
 * avoids layout-changing wrappers around every icon button, input, and metadata chip.
 */
export function TitleTooltipProvider({ children }: { children: ReactNode }) {
  const id = useId();
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState<{ text: string; x: number; top: number; bottom: number; below: boolean }>();

  useLayoutEffect(() => {
    if (!active || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const edge = 8;
    const x = Math.min(Math.max(active.x, edge + rect.width / 2), window.innerWidth - edge - rect.width / 2);
    // Tooltips prefer to sit above their target. Flip below only when the top edge
    // would be clipped; an above tooltip is naturally safe for controls by the bottom.
    const below = active.below || rect.top < edge;
    if (x !== active.x || below !== active.below) setActive({ ...active, x, below });
  }, [active]);

  const targetFor = (element: EventTarget | null) => element instanceof Element
    ? element.closest<HTMLElement>("[title], [data-sonata-tooltip]")
    : null;
  const show = (element: HTMLElement | null) => {
    if (!element) return;
    const text = element.dataset.sonataTooltip ?? element.getAttribute("title");
    if (!text) return;
    element.dataset.sonataTooltip = text;
    element.removeAttribute("title");
    if (!element.hasAttribute("aria-describedby")) element.setAttribute("aria-describedby", id);
    const rect = element.getBoundingClientRect();
    setActive({ text, x: rect.left + rect.width / 2, top: rect.top - 7, bottom: rect.bottom + 7, below: false });
  };
  const hide = (event: PointerEvent<HTMLSpanElement> | FocusEvent<HTMLSpanElement>) => {
    const leaving = targetFor(event.target);
    if (leaving && leaving.contains(event.relatedTarget as Node | null)) return;
    setActive(undefined);
  };

  return (
    <span className="title-tooltip-provider" onPointerOver={(event) => show(targetFor(event.target))} onPointerOut={hide} onFocusCapture={(event) => show(targetFor(event.target))} onBlurCapture={hide}>
      {children}
      {active && <span ref={tooltipRef} className={`tooltip global-tooltip${active.below ? " below" : ""}`} id={id} role="tooltip" style={{ left: active.x, top: active.below ? active.bottom : active.top }}>{active.text}</span>}
    </span>
  );
}
