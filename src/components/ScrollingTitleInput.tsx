import { useLayoutEffect, useRef, useState, type ChangeEventHandler, type FocusEventHandler } from "react";

/**
 * Keeps an overlong title readable while it is idle. Native inputs already
 * follow the caret while editing, so the motion deliberately pauses on focus.
 */
export function ScrollingTitleInput({
  value,
  onChange,
  onBlur,
  className,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const measure = () => setScrollDistance(Math.max(0, input.scrollWidth - input.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    return () => observer.disconnect();
  }, [value]);

  return (
    <input
      ref={inputRef}
      className={`${className ?? ""}${scrollDistance ? " is-title-overflowing" : ""}`}
      style={{ "--title-scroll-distance": `-${scrollDistance}px` }}
      aria-label="Title"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
