import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "./icons";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 320;
const MARGIN = 6;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildGrid(monthStart: Date): Date[] {
  const startOffset = monthStart.getDay();
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

function formatDisplay(iso: string): string {
  const date = parseISO(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

interface Placement {
  top: number;
  left: number;
}

function computePlacement(rect: DOMRect): Placement {
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < POPOVER_HEIGHT + MARGIN && spaceAbove > spaceBelow;
  const top = openUpward
    ? Math.max(MARGIN, rect.top - POPOVER_HEIGHT - MARGIN)
    : Math.min(rect.bottom + MARGIN, window.innerHeight - POPOVER_HEIGHT - MARGIN);
  let left = rect.left;
  if (left + POPOVER_WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - POPOVER_WIDTH - MARGIN;
  if (left < MARGIN) left = MARGIN;
  return { top, left };
}

export function DueDateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(value ? parseISO(value) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    setViewMonth(firstOfMonth(value ? parseISO(value) : new Date()));
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPlacement(computePlacement(rect));

    const close = () => setOpen(false);
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (date: Date) => {
    onChange(toISO(date));
    setOpen(false);
  };

  const shortcut = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    pick(d);
  };

  return (
    <div className="date-picker" ref={containerRef}>
      <button type="button" className={`date-picker-trigger${value ? " has-value" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconCalendar size={14} />
        <span>{value ? formatDisplay(value) : "No date"}</span>
      </button>
      {value && (
        <button type="button" className="icon-btn" aria-label="Clear due date" title="Clear due date" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")}>
          <IconX size={11} />
        </button>
      )}
      {open && placement &&
        createPortal(
          <div ref={popoverRef} className="date-picker-popover" role="dialog" aria-label="Choose due date" style={{ top: placement.top, left: placement.left }}>
            <div className="date-picker-shortcuts">
              <button type="button" onClick={() => shortcut(0)}>Today</button>
              <button type="button" onClick={() => shortcut(1)}>Tomorrow</button>
              <button type="button" onClick={() => shortcut(7)}>Next week</button>
            </div>
            <div className="date-picker-header">
              <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><IconChevronLeft size={14} /></button>
              <span>{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
              <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><IconChevronRight size={14} /></button>
            </div>
            <div className="date-picker-weekdays">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="date-picker-grid">
              {buildGrid(viewMonth).map((date) => {
                const iso = toISO(date);
                return (
                  <button
                    type="button"
                    key={iso}
                    className={`${date.getMonth() === viewMonth.getMonth() ? "" : "outside"}${sameDay(date, today) ? " today" : ""}${value === iso ? " selected" : ""}`}
                    onClick={() => pick(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
