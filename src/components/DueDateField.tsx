import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "./icons";
import type { ComponentType } from "react";
import { formatDateTime, joinDateTime, splitDateTime } from "../lib/dateTime";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const POPOVER_WIDTH = 240;
const DATE_TIME_POPOVER_WIDTH = 464;
const POPOVER_HEIGHT = 320;
const MARGIN = 6;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const WHEEL_COPIES = [0, 1, 2, 3, 4];
const PRIMARY_WHEEL_COPY = 2;

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

function computePlacement(rect: DOMRect, popoverWidth: number): Placement {
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < POPOVER_HEIGHT + MARGIN && spaceAbove > spaceBelow;
  const top = openUpward
    ? Math.max(MARGIN, rect.top - POPOVER_HEIGHT - MARGIN)
    : Math.min(rect.bottom + MARGIN, window.innerHeight - POPOVER_HEIGHT - MARGIN);
  let left = rect.left;
  if (left + popoverWidth > window.innerWidth - MARGIN) left = window.innerWidth - popoverWidth - MARGIN;
  if (left < MARGIN) left = MARGIN;
  return { top, left };
}

/**
 * Scrolls a wheel so `index` of the primary copy sits in the middle of its viewport,
 * which is also where the circular scroll handler expects the user to start.
 */
function centerWheel(wheel: HTMLDivElement | null, length: number, index: number) {
  const option = wheel?.children[PRIMARY_WHEEL_COPY * length + index];
  if (!wheel || !option) return;
  const wheelTop = wheel.getBoundingClientRect().top;
  const optionRect = option.getBoundingClientRect();
  // Adjusting by a delta is correct wherever the wheel already sits, and never has to
  // clamp at 0: the primary copy is two whole ranges down.
  wheel.scrollTop += optionRect.top - wheelTop - (wheel.clientHeight - optionRect.height) / 2;
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
  // Reminder changes are a draft until Done. A past value therefore cannot be autosaved
  // and delivered by the native watcher while the user is still choosing a time.
  const [draft, setDraft] = useState(value);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { date: datePart, time: timePart } = splitDateTime(withTime ? draft : value);
  const [selectedHour, setSelectedHour] = useState(0);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(datePart ? parseISO(datePart) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    setSelectedHour(timePart ? Number(timePart.slice(0, 2)) : 0);
    setSelectedMinute(timePart ? Number(timePart.slice(3, 5)) : 0);
  }, [timePart]);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  // The wheels are only mounted once a placement has been measured, so this waits for
  // one rather than for `open` alone. It deliberately ignores later hour/minute
  // changes: re-centering under a click would yank the wheel the user is reading.
  useLayoutEffect(() => {
    if (!open || !withTime || !placement) return;
    centerWheel(hourListRef.current, HOURS.length, selectedHour);
    centerWheel(minuteListRef.current, MINUTES.length, selectedMinute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, withTime]);

  const keepWheelCircular = (event: UIEvent<HTMLDivElement>) => {
    const wheel = event.currentTarget;
    const segmentHeight = wheel.scrollHeight / WHEEL_COPIES.length;
    if (!segmentHeight) return;
    // Keep the user in the middle three copies. Moving by two full, identical ranges
    // preserves the visual position while giving momentum scrolling room to slow down.
    if (wheel.scrollTop < segmentHeight * 0.5) wheel.scrollTop += segmentHeight * 2;
    else if (wheel.scrollTop > segmentHeight * 4.5) wheel.scrollTop -= segmentHeight * 2;
  };

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    setViewMonth(firstOfMonth(datePart ? parseISO(datePart) : new Date()));
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPlacement(computePlacement(rect, withTime ? DATE_TIME_POPOVER_WIDTH : POPOVER_WIDTH));

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
    // The time picker has scrollable hour/minute grids. Only a scroll outside this
    // popover means its anchor may have moved; scrolling a grid is an interaction.
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withTime]);

  // Picking a day keeps whatever time is already set, so choosing "tomorrow" on a 15:30
  // reminder does not silently drop the 15:30.
  const pick = (date: Date) => {
    const next = joinDateTime(toISO(date), withTime ? timePart : "");
    if (withTime) setDraft(next);
    else onChange(next);
    if (!withTime) setOpen(false);
  };

  const saveTime = (hour: number, minute: number) => {
    if (!datePart) return;
    setDraft(joinDateTime(datePart, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`));
  };
  const pickHour = (hour: number) => {
    setSelectedHour(hour);
    saveTime(hour, selectedMinute);
  };
  const pickMinute = (minute: number) => {
    setSelectedMinute(minute);
    saveTime(selectedHour, minute);
  };
  const clearTime = () => {
    setDraft(joinDateTime(datePart, ""));
  };

  const shortcut = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    pick(d);
  };

  // Date-only reminders use the same 09:00 default as the Rust reminder watcher.
  const reminderMoment = (() => {
    if (!withTime || !datePart) return undefined;
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart ? timePart.split(":").map(Number) : [9, 0];
    const moment = new Date(year, month - 1, day, hour, minute);
    return Number.isNaN(moment.getTime()) ? undefined : moment;
  })();
  const reminderIsPast = Boolean(reminderMoment && reminderMoment.getTime() <= Date.now());

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
          <div ref={popoverRef} className={`date-picker-popover${withTime ? " with-time" : ""}`} role="dialog" aria-label={`Choose ${label}`} style={{ top: placement.top, left: placement.left }}>
            {!withTime && <div className="date-picker-shortcuts">
              <button type="button" onClick={() => shortcut(0)}>Today</button>
              <button type="button" onClick={() => shortcut(1)}>Tomorrow</button>
              <button type="button" onClick={() => shortcut(7)}>Next week</button>
            </div>}
            <div className="date-time-picker-content">
              <div className="date-picker-calendar">
              {withTime && <div className="date-picker-shortcuts">
                <button type="button" onClick={() => shortcut(0)}>Today</button>
                <button type="button" onClick={() => shortcut(1)}>Tomorrow</button>
                <button type="button" onClick={() => shortcut(7)}>Next week</button>
              </div>}
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
                    <button type="button" key={iso} className={`${date.getMonth() === viewMonth.getMonth() ? "" : "outside"}${sameDay(date, today) ? " today" : ""}${datePart === iso ? " selected" : ""}`} onClick={() => pick(date)}>{date.getDate()}</button>
                  );
                })}
              </div>
              </div>
              {withTime && (
                <div className="custom-time-picker" role="group" aria-label={`Time picker for ${label}`}>
                  <div className="custom-time-picker-toolbar">
                    <output aria-label={`Time for ${label}`}>{timePart || "00:00"}</output>
                    {timePart && <button type="button" className="icon-btn" aria-label="Clear time" title="Clear time" onClick={clearTime}><IconX size={11} /></button>}
                  </div>
                  <div className="custom-time-picker-column">
                    <strong>Hour</strong>
                    <div ref={hourListRef} className="custom-time-picker-options" role="listbox" aria-label="Hour" onScroll={keepWheelCircular}>
                      {WHEEL_COPIES.flatMap((copy) => HOURS.map((hour) => {
                        const primary = copy === PRIMARY_WHEEL_COPY;
                        return <button type="button" key={`${copy}-${hour}`} role={primary ? "option" : undefined} aria-selected={primary ? selectedHour === hour : undefined} aria-hidden={!primary} tabIndex={primary ? undefined : -1} disabled={!datePart} onClick={() => pickHour(hour)}>{String(hour).padStart(2, "0")}</button>;
                      }))}
                    </div>
                  </div>
                  <div className="custom-time-picker-column">
                    <strong>Minute</strong>
                    <div ref={minuteListRef} className="custom-time-picker-options" role="listbox" aria-label="Minute" onScroll={keepWheelCircular}>
                      {WHEEL_COPIES.flatMap((copy) => MINUTES.map((minute) => {
                        const primary = copy === PRIMARY_WHEEL_COPY;
                        return <button type="button" key={`${copy}-${minute}`} role={primary ? "option" : undefined} aria-selected={primary ? selectedMinute === minute : undefined} aria-hidden={!primary} tabIndex={primary ? undefined : -1} disabled={!datePart} onClick={() => pickMinute(minute)}>{String(minute).padStart(2, "0")}</button>;
                      }))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {withTime && <div className={`date-time-picker-actions${reminderIsPast ? " has-warning" : ""}`}>
              {reminderIsPast && <p className="date-time-picker-warning" role="alert">Choose a future reminder time before continuing.</p>}
              <button type="button" className="primary" disabled={reminderIsPast} onClick={() => { onChange(draft); setOpen(false); }}>Done</button>
            </div>}
          </div>,
          document.body,
        )}
    </div>
  );
}
