import type { DocumentSummary } from "../types/domain";

const REMINDER_SOON_MS = 30 * 60 * 1000;
const DEFAULT_REMINDER_HOUR = 9;

export interface DocumentAttention {
  due?: string;
  reminder?: string;
  labels: string[];
}

function localDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : undefined;
}

function reminderDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?$/.exec(value.trim());
  if (!match) return undefined;
  const hour = match[4] === undefined ? DEFAULT_REMINDER_HOUR : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) && date.getHours() === hour && date.getMinutes() === minute ? date : undefined;
}

/** Returns the unacknowledged attention states for an actionable document. */
export function documentAttention(doc: DocumentSummary, now = new Date()): DocumentAttention | undefined {
  if (doc.archived || doc.status === "completed" || doc.status === "cancelled") return undefined;
  const labels: string[] = [];
  let due: string | undefined;
  let reminder: string | undefined;

  if (doc.due && doc.acknowledgedDue !== doc.due) {
    const date = localDate(doc.due);
    if (date) {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (date.getTime() < today.getTime()) {
        due = doc.due;
        labels.push("Overdue");
      } else if (date.getTime() === today.getTime()) {
        due = doc.due;
        labels.push("Due today");
      }
    }
  }

  if (doc.reminder && doc.acknowledgedReminder !== doc.reminder) {
    const at = reminderDate(doc.reminder);
    if (at) {
      const delta = at.getTime() - now.getTime();
      if (delta <= 0) {
        reminder = doc.reminder;
        labels.push("Reminder missed");
      } else if (delta <= REMINDER_SOON_MS) {
        reminder = doc.reminder;
        const minutes = Math.max(1, Math.ceil(delta / 60_000));
        labels.push(`Reminder in ${minutes} min`);
      }
    }
  }

  return labels.length ? { due, reminder, labels } : undefined;
}
