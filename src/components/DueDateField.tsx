import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "./icons";
import type { ComponentType } from "react";
import { formatDateTime, joinDateTime, splitDateTime, todayISO } from "../lib/dateTime";

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

/**
 * A date picker. Generalized past "due date" so the task reminder can reuse it — a second
 * calendar implementation would be the same code with a different icon.
 */
export function DueDateField({
  value,
  onChange,
  icon: Icon = IconCalendar,
  placeholder = "No date",
  label = "due date",
  withTime = false,
}: {
  value: string;
  onChange: (value: string) => void;
  icon?: ComponentType<{ size?: number }>;
  placeholder?: string;
  /** Names the field in the trigger, clear button and dialog labels, e.g. "reminder". */
  label?: string;
  /**
   * Offers a time of day alongside the date, storing `YYYY-MM-DDTHH:MM`.
   *
   * Off for due dates: a due date is a day, and `Index::list` compares `due_at` against
   * `date('now','localtime')`, so a time component there would quietly break the Today
   * and Upcoming views.
   */
  withTime?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { date: datePart, time: timePart } = splitDateTime(value);
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(datePart ? parseISO(datePart) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    setViewMonth(firstOfMonth(datePart ? parseISO(datePart) : new Date()));
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

  // Picking a day keeps whatever time is already set, so choosing "tomorrow" on a 15:30
  // reminder does not silently drop the 15:30.
  const pick = (date: Date) => {
    onChange(joinDateTime(toISO(date), withTime ? timePart : ""));
    setOpen(false);
  };

  // A time on its own is not a moment, so the first time picked implies today. The
  // popover stays open — you have said when, not yet which day.
  const pickTime = (time: string) => onChange(joinDateTime(datePart || todayISO(), time));

  const shortcut = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    pick(d);
  };

  return (
    <div className="date-picker" ref={containerRef}>
      <button type="button" className={`date-picker-trigger${value ? " has-value" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`Choose ${label}`} onClick={() => setOpen((o) => !o)}>
        <Icon size={14} />
        <span>{formatDateTime(value) || placeholder}</span>
      </button>
      {value && (
        <button type="button" className="icon-btn" aria-label={`Clear ${label}`} title={`Clear ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")}>
          <IconX size={11} />
        </button>
      )}
      {open && placement &&
        createPortal(
          <div ref={popoverRef} className="date-picker-popover" role="dialog" aria-label={`Choose ${label}`} style={{ top: placement.top, left: placement.left }}>
            <div className="date-picker-shortcuts">
              <button type="button" onClick={() => shortcut(0)}>Today</button>
              <button type="button" onClick={() => shortcut(1)}>Tomorrow</button>
              <button type="button" onClick={() => shortcut(7)}>Next week</button>
            </div>
            {withTime && (
              <div className="date-picker-time">
                <label htmlFor={`${label}-time`}>Time</label>
                <input
                  id={`${label}-time`}
                  type="time"
                  aria-label={`Time for ${label}`}
                  value={timePart}
                  onChange={(e) => pickTime(e.target.value)}
                />
                {timePart ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Clear time"
                    title="Clear the time — the reminder falls back to the morning"
                    onClick={() => onChange(joinDateTime(datePart, ""))}
                  >
                    <IconX size={11} />
                  </button>
                ) : (
                  <small>from 9:00</small>
                )}
              </div>
            )}
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
                    className={`${date.getMonth() === viewMonth.getMonth() ? "" : "outside"}${sameDay(date, today) ? " today" : ""}${datePart === iso ? " selected" : ""}`}
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
