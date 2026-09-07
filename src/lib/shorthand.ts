import type { DocumentType } from "../types/domain";

/**
 * Autocomplete for the quick-add shorthand grammar:
 *
 *   [task|note|idea|bookmark] Title #tag @due:date
 *
 * Everything offered here has to be something the Rust `capture_input` parser actually
 * understands — suggesting e.g. "@due:next friday" would look helpful and then silently
 * store an unusable due date, so the date keywords below are exactly the ones
 * `markdown::resolve_due_keyword` resolves, plus already-resolved `YYYY-MM-DD` values
 * (which pass straight through).
 */
export interface ShorthandSuggestion {
  /** Text that replaces the token being typed. */
  insert: string;
  label: string;
  hint?: string;
  /** `false` for tokens the user keeps typing into, e.g. the bare "@due:" scaffold. */
  space?: boolean;
}

export interface ShorthandMatch {
  /** Offset in the input where the token being completed starts. */
  start: number;
  items: ShorthandSuggestion[];
}

export const TYPE_KEYWORDS: DocumentType[] = ["task", "note", "idea", "bookmark"];

// The capture parser also reads "todo" as a task, so detection has to accept a
// word the suggestion list never offers.
const CAPTURE_TYPE_WORDS: string[] = [...TYPE_KEYWORDS, "todo"];

/** Whether the text opens with a word the capture parser reads as a type. */
export function opensWithTypeKeyword(text: string): boolean {
  const [first = ""] = text.trimStart().split(/\s+/, 1);
  return CAPTURE_TYPE_WORDS.includes(first.toLowerCase());
}

export function isoDate(offsetDays: number, from: Date = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dueSuggestions(today: Date = new Date()): Array<ShorthandSuggestion & { match: string[] }> {
  return [
    { insert: "@due:today", label: "@due:today", hint: isoDate(0, today), match: ["today"] },
    { insert: "@due:tomorrow", label: "@due:tomorrow", hint: isoDate(1, today), match: ["tomorrow"] },
    { insert: "@due:yesterday", label: "@due:yesterday", hint: isoDate(-1, today), match: ["yesterday"] },
    {
      insert: `@due:${isoDate(7, today)}`,
      label: `@due:${isoDate(7, today)}`,
      hint: "in a week",
      match: ["week", "next", isoDate(7, today)],
    },
  ];
}

const MAX_ITEMS = 6;

/** The run of non-whitespace characters ending at `caret`. */
function tokenAt(text: string, caret: number): { start: number; token: string } {
  const before = text.slice(0, caret);
  const start = before.search(/\S*$/);
  return { start, token: before.slice(start) };
}

export function shorthandSuggestions(
  text: string,
  caret: number,
  knownTags: Array<{ tag: string; count: number }>,
  options: { offerTypes: boolean; today?: Date } = { offerTypes: true },
): ShorthandMatch | null {
  const { start, token } = tokenAt(text, caret);
  // A token that already spells out its only completion has nothing left to complete —
  // returning it anyway would make Enter re-accept it instead of submitting the capture.
  const unlessAlreadyTyped = (items: ShorthandSuggestion[]): ShorthandMatch | null =>
    items.length === 0 || (items.length === 1 && items[0].insert === token) ? null : { start, items };

  if (token.startsWith("#")) {
    const query = token.slice(1).toLowerCase();
    // Tags already written elsewhere in the line are not worth offering again.
    const used = new Set<string>();
    for (const m of text.matchAll(/#(\S+)/g)) {
      if (m.index !== start) used.add(m[1].toLowerCase());
    }
    const items = knownTags
      .filter(({ tag }) => tag.toLowerCase().includes(query) && !used.has(tag.toLowerCase()))
      .slice(0, MAX_ITEMS)
      .map(({ tag, count }) => ({ insert: `#${tag}`, label: `#${tag}`, hint: String(count) }));
    return unlessAlreadyTyped(items);
  }

  if (token.startsWith("@")) {
    const due = /^@due:(.*)$/.exec(token);
    if (!due) {
      // Still spelling out the field name — offer the scaffold, and leave the caret
      // right after it so the date can be typed or picked from the list that follows.
      return "@due:".startsWith(token)
        ? { start, items: [{ insert: "@due:", label: "@due:", hint: "due date", space: false }] }
        : null;
    }
    const query = due[1].toLowerCase();
    const items = dueSuggestions(options.today)
      .filter(({ match }) => query === "" || match.some((m) => m.toLowerCase().startsWith(query)))
      .map(({ insert, label, hint }) => ({ insert, label, hint }));
    return unlessAlreadyTyped(items);
  }

  // The type keyword is only meaningful as the very first word, and only when the type
  // isn't already pinned by the dropdown or the current view.
  if (options.offerTypes && start === 0 && token.length > 0) {
    const query = token.toLowerCase();
    const items = TYPE_KEYWORDS.filter((k) => k.startsWith(query)).map((k) => ({
      insert: k,
      label: k,
      hint: "type",
    }));
    return unlessAlreadyTyped(items);
  }

  return null;
}

/** Applies a suggestion to `text`, returning the new text and where the caret should land. */
export function applyShorthandSuggestion(
  text: string,
  start: number,
  caret: number,
  suggestion: ShorthandSuggestion,
): { text: string; caret: number } {
  const rest = text.slice(caret);
  // Completing mid-line, the separator is usually already there — adding another would
  // leave a double space behind the caret.
  const separator = suggestion.space === false || /^\s/.test(rest) ? "" : " ";
  const insert = suggestion.insert + separator;
  const skip = separator === "" && suggestion.space !== false ? 1 : 0;
  return { text: text.slice(0, start) + insert + rest, caret: start + insert.length + skip };
}
