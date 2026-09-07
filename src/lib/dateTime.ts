/**
 * The reminder value's two halves.
 *
 * A reminder is stored as `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` — local wall-clock, no
 * timezone, because "remind me at 09:00" means 09:00 wherever you are. A date with no time
 * fires at a default morning hour, which the Rust side owns (`reminders::DEFAULT_HOUR`);
 * nothing here invents a time the user did not set.
 *
 * Parsing is as generous as the Rust parser (space separator, optional seconds) so a
 * hand-written frontmatter value round-trips through the editor unchanged in meaning.
 */
export interface DateTimeParts {
  date: string;
  time: string;
}

export function splitDateTime(value: string): DateTimeParts {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value.trim());
  if (!match) return { date: "", time: "" };
  return { date: match[1], time: match[2] ?? "" };
}

/** Rejoins the halves. A time with no date is not a reminder, so it yields nothing. */
export function joinDateTime(date: string, time: string): string {
  if (!date) return "";
  return time ? `${date}T${time}` : date;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "3:30 PM" — the 24h stored value in the reader's own locale. */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const date = new Date(2000, 0, 1, h, m);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** How a stored date-or-datetime reads in a trigger button. */
export function formatDateTime(value: string): string {
  const { date, time } = splitDateTime(value);
  if (!date) return "";
  const parsed = parseDate(date);
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  const day = parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return time ? `${day}, ${formatTime(time)}` : day;
}

/** Today as `YYYY-MM-DD`, for when a time is picked before a date. */
export function todayISO(from: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
}
