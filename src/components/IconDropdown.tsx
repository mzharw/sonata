import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { IconChevronDown } from "./icons";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ComponentType<{ size?: number; fill?: string }>;
  colorVar?: string;
}

export function IconDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  showLabel = true,
  showChevron = true,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  showLabel?: boolean;
  showChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const Icon = current?.icon;

  useDismiss(open, () => setOpen(false), containerRef);

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = Math.min(240, options.length * 34 + 10);
      setOpenUpward(window.innerHeight - rect.bottom < estimatedHeight + 12 && rect.top > estimatedHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const style = current?.colorVar ? ({ color: `var(${current.colorVar})` } as CSSProperties) : undefined;

  return (
    <div className={`icon-dropdown${className ? ` ${className}` : ""}`} ref={containerRef}>
      <button
        type="button"
        className="icon-dropdown-trigger"
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          } else if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit(options[highlight].value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }
        }}
      >
        {Icon && <Icon size={14} fill={current?.colorVar ? "currentColor" : "none"} />}
        {showLabel && <span>{current?.label}</span>}
        {showChevron && <IconChevronDown size={11} className="icon-dropdown-chevron" />}
      </button>
      {open && (
        <ul className={`icon-dropdown-popover${openUpward ? " placement-up" : ""}`} role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => {
            const OptIcon = o.icon;
            return (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={`${o.value === value ? "active" : ""}${i === highlight ? " highlight" : ""}`}
                  style={o.colorVar ? ({ color: `var(${o.colorVar})` } as CSSProperties) : undefined}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(o.value)}
                >
                  {OptIcon && <OptIcon size={14} fill={o.colorVar ? "currentColor" : "none"} />}
                  <span>{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
