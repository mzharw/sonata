import type { ComponentType } from "react";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconInlineCode,
  IconLink,
  IconHeading,
  IconListBullets,
  IconListNumbers,
  IconQuote,
  IconCodeBlock,
  IconMinus,
  IconCheckSquare,
  IconTable,
} from "../components/icons";

export const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

export interface Range {
  start: number;
  end: number;
}

export interface ApplyResult extends Range {
  value: string;
}

export function wrapSelection(value: string, sel: Range, before: string, after: string): ApplyResult {
  const selected = value.slice(sel.start, sel.end);
  const next = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
  return { value: next, start: sel.start + before.length, end: sel.start + before.length + selected.length };
}

export function lineBounds(value: string, sel: Range) {
  const start = value.lastIndexOf("\n", sel.start - 1) + 1;
  const nextNewline = value.indexOf("\n", sel.end);
  const end = nextNewline === -1 ? value.length : nextNewline;
  return { start, end };
}

export function toggleLinePrefix(value: string, sel: Range, makePrefix: (lineIndex: number) => string, stripPattern: RegExp): ApplyResult {
  const { start, end } = lineBounds(value, sel);
  const block = value.slice(start, end);
  const lines = block.split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((l) => stripPattern.test(l));
  const nextLines = lines.map((line, i) => {
    if (line.trim() === "" && lines.length > 1) return line;
    return allPrefixed ? line.replace(stripPattern, "") : makePrefix(i) + line;
  });
  const nextBlock = nextLines.join("\n");
  const next = value.slice(0, start) + nextBlock + value.slice(end);
  return { value: next, start, end: start + nextBlock.length };
}

const HEADING_PATTERN = /^#{1,6}\s+/;

export function toggleHeadingLevel(value: string, sel: Range, level: number): ApplyResult {
  const { start, end } = lineBounds(value, sel);
  const block = value.slice(start, end);
  const prefix = "#".repeat(level) + " ";
  const lines = block.split("\n");
  const nextLines = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;
    const stripped = line.replace(HEADING_PATTERN, "");
    const alreadyThisLevel = HEADING_PATTERN.test(line) && line.startsWith(prefix);
    return alreadyThisLevel ? stripped : prefix + stripped;
  });
  const nextBlock = nextLines.join("\n");
  const next = value.slice(0, start) + nextBlock + value.slice(end);
  return { value: next, start, end: start + nextBlock.length };
}

export function indentLines(value: string, sel: Range): ApplyResult {
  const { start, end } = lineBounds(value, sel);
  const nextBlock = value
    .slice(start, end)
    .split("\n")
    .map((l) => (l.length ? "  " + l : l))
    .join("\n");
  const next = value.slice(0, start) + nextBlock + value.slice(end);
  return { value: next, start, end: start + nextBlock.length };
}

export function outdentLines(value: string, sel: Range): ApplyResult {
  const { start, end } = lineBounds(value, sel);
  const nextBlock = value
    .slice(start, end)
    .split("\n")
    .map((l) => l.replace(/^ {1,2}/, ""))
    .join("\n");
  const next = value.slice(0, start) + nextBlock + value.slice(end);
  return { value: next, start, end: start + nextBlock.length };
}

export function insertLink(value: string, sel: Range): ApplyResult {
  const selected = value.slice(sel.start, sel.end) || "link text";
  const next = value.slice(0, sel.start) + "[" + selected + "](url)" + value.slice(sel.end);
  const urlStart = sel.start + 1 + selected.length + 2;
  return { value: next, start: urlStart, end: urlStart + 3 };
}

export function insertCodeBlock(value: string, sel: Range): ApplyResult {
  const selected = value.slice(sel.start, sel.end);
  const before = "```\n";
  const after = "\n```";
  const next = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
  return { value: next, start: sel.start + before.length, end: sel.start + before.length + selected.length };
}

export function insertHorizontalRule(value: string, sel: Range): ApplyResult {
  const { end } = lineBounds(value, sel);
  const insertion = "\n\n---";
  const next = value.slice(0, end) + insertion + value.slice(end);
  const pos = end + insertion.length;
  return { value: next, start: pos, end: pos };
}

export function insertTable(value: string, sel: Range): ApplyResult {
  const snippet = "| Header | Header |\n| --- | --- |\n| Cell | Cell |";
  const next = value.slice(0, sel.start) + snippet + value.slice(sel.end);
  const pos = sel.start + snippet.length;
  return { value: next, start: pos, end: pos };
}

export function toggleTaskItem(value: string, sel: Range): ApplyResult {
  return toggleLinePrefix(value, sel, () => "- [ ] ", /^-\s\[[ xX]\]\s/);
}

const TASK_LINE = /^(\s*[-*]\s\[)([ xX])(\]\s)/gm;

/**
 * Flips the Nth "- [ ]"/"- [x]" checkbox found in `source` (top-to-bottom, matching the
 * order checkboxes render in — see renderTokensHtml's disabled-attribute stripping in
 * MarkdownEditor.tsx, which is what makes these clickable straight from the preview).
 */
export function toggleNthTaskItem(source: string, index: number): string {
  let count = -1;
  return source.replace(TASK_LINE, (match, before: string, mark: string, after: string) => {
    count += 1;
    if (count !== index) return match;
    return `${before}${mark.trim() === "" ? "x" : " "}${after}`;
  });
}

export interface Hotkey {
  /** Matched against `e.key.toLowerCase()` — use for letter keys (layout-safe). */
  key?: string;
  /** Matched against `e.code` (e.g. "Digit8") — use for digit-row keys, since Shift remaps `e.key` on most layouts (Shift+8 -> "*", not "8"). */
  code?: string;
  shift?: boolean;
}

export interface Command {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  toolbar?: boolean;
  hotkey?: Hotkey;
  hotkeyLabel?: string;
  example?: string;
  keywords?: string[];
  apply: (value: string, sel: Range) => ApplyResult;
}

export const COMMANDS: Command[] = [
  { id: "bold", label: "Bold", icon: IconBold, toolbar: true, hotkey: { key: "b" }, hotkeyLabel: `${MOD_KEY}+B`, example: "**text**", keywords: ["strong"], apply: (v, s) => wrapSelection(v, s, "**", "**") },
  { id: "italic", label: "Italic", icon: IconItalic, toolbar: true, hotkey: { key: "i" }, hotkeyLabel: `${MOD_KEY}+I`, example: "_text_", keywords: ["emphasis"], apply: (v, s) => wrapSelection(v, s, "_", "_") },
  { id: "strike", label: "Strikethrough", icon: IconStrikethrough, toolbar: true, hotkey: { key: "x", shift: true }, hotkeyLabel: `${MOD_KEY}+Shift+X`, example: "~~text~~", keywords: ["strikethrough"], apply: (v, s) => wrapSelection(v, s, "~~", "~~") },
  { id: "code", label: "Inline code", icon: IconInlineCode, toolbar: true, hotkey: { key: "e" }, hotkeyLabel: `${MOD_KEY}+E`, example: "`code`", keywords: ["monospace"], apply: (v, s) => wrapSelection(v, s, "`", "`") },
  { id: "link", label: "Link", icon: IconLink, toolbar: true, hotkey: { key: "k" }, hotkeyLabel: `${MOD_KEY}+K`, example: "[text](url)", keywords: ["url", "href"], apply: insertLink },
  { id: "heading1", label: "Heading 1", icon: IconHeading, hotkey: { code: "Digit1" }, hotkeyLabel: `${MOD_KEY}+1`, example: "# text", keywords: ["h1", "title"], apply: (v, s) => toggleHeadingLevel(v, s, 1) },
  { id: "heading2", label: "Heading 2", icon: IconHeading, toolbar: true, hotkey: { code: "Digit2" }, hotkeyLabel: `${MOD_KEY}+2`, example: "## text", keywords: ["h2", "heading", "subtitle"], apply: (v, s) => toggleHeadingLevel(v, s, 2) },
  { id: "heading3", label: "Heading 3", icon: IconHeading, hotkey: { code: "Digit3" }, hotkeyLabel: `${MOD_KEY}+3`, example: "### text", keywords: ["h3"], apply: (v, s) => toggleHeadingLevel(v, s, 3) },
  { id: "heading4", label: "Heading 4", icon: IconHeading, hotkey: { code: "Digit4" }, hotkeyLabel: `${MOD_KEY}+4`, example: "#### text", keywords: ["h4"], apply: (v, s) => toggleHeadingLevel(v, s, 4) },
  { id: "heading5", label: "Heading 5", icon: IconHeading, hotkey: { code: "Digit5" }, hotkeyLabel: `${MOD_KEY}+5`, example: "##### text", keywords: ["h5"], apply: (v, s) => toggleHeadingLevel(v, s, 5) },
  { id: "heading6", label: "Heading 6", icon: IconHeading, hotkey: { code: "Digit6" }, hotkeyLabel: `${MOD_KEY}+6`, example: "###### text", keywords: ["h6"], apply: (v, s) => toggleHeadingLevel(v, s, 6) },
  { id: "bullet", label: "Bullet list", icon: IconListBullets, toolbar: true, hotkey: { code: "Digit8", shift: true }, hotkeyLabel: `${MOD_KEY}+Shift+8`, example: "- item", keywords: ["unordered", "list"], apply: (v, s) => toggleLinePrefix(v, s, () => "- ", /^[-*]\s/) },
  { id: "numbered", label: "Numbered list", icon: IconListNumbers, toolbar: true, hotkey: { code: "Digit7", shift: true }, hotkeyLabel: `${MOD_KEY}+Shift+7`, example: "1. item", keywords: ["ordered", "list"], apply: (v, s) => toggleLinePrefix(v, s, (i) => `${i + 1}. `, /^\d+\.\s/) },
  { id: "quote", label: "Quote", icon: IconQuote, toolbar: true, hotkey: { code: "Digit9", shift: true }, hotkeyLabel: `${MOD_KEY}+Shift+9`, example: "> text", keywords: ["blockquote"], apply: (v, s) => toggleLinePrefix(v, s, () => "> ", /^>\s/) },
  { id: "task", label: "Task list", icon: IconCheckSquare, example: "- [ ] item", keywords: ["checkbox", "todo", "checklist"], apply: toggleTaskItem },
  { id: "codeblock", label: "Code block", icon: IconCodeBlock, hotkey: { key: "c", shift: true }, hotkeyLabel: `${MOD_KEY}+Shift+C`, example: "```\ncode\n```", keywords: ["fence", "snippet"], apply: insertCodeBlock },
  { id: "hr", label: "Divider", icon: IconMinus, example: "---", keywords: ["horizontal rule", "separator", "line"], apply: insertHorizontalRule },
  { id: "table", label: "Table", icon: IconTable, example: "| a | b |", keywords: ["grid"], apply: insertTable },
];

export function matchHotkey(command: Command, e: { key: string; code: string; shiftKey: boolean }): boolean {
  const hotkey = command.hotkey;
  if (!hotkey) return false;
  if (Boolean(hotkey.shift) !== e.shiftKey) return false;
  if (hotkey.code) return hotkey.code === e.code;
  return hotkey.key === e.key.toLowerCase();
}

export function filterCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMANDS;
  return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.keywords?.some((k) => k.includes(q)));
}

const LIST_CONTINUE: { re: RegExp; make: (m: RegExpMatchArray) => string }[] = [
  { re: /^(\s*-\s\[[ xX]\]\s)/, make: (m) => m[1].replace(/\[[ xX]\]/, "[ ]") },
  { re: /^(\s*[-*]\s)/, make: (m) => m[1] },
  { re: /^(\s*)(\d+)(\.\s)/, make: (m) => `${m[1]}${Number(m[2]) + 1}${m[3]}` },
  { re: /^(\s*>\s)/, make: (m) => m[1] },
];

export function continueListOnEnter(value: string, sel: Range): ApplyResult | null {
  if (sel.start !== sel.end) return null;
  const lineStart = value.lastIndexOf("\n", sel.start - 1) + 1;
  const nextNewline = value.indexOf("\n", sel.start);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const fullLine = value.slice(lineStart, lineEnd);
  for (const { re, make } of LIST_CONTINUE) {
    const m = fullLine.match(re);
    if (!m) continue;
    const prefix = m[0];
    if (fullLine.trim() === prefix.trim()) {
      const next = value.slice(0, lineStart) + value.slice(lineStart + prefix.length);
      return { value: next, start: lineStart, end: lineStart };
    }
    const insertion = "\n" + make(m);
    const next = value.slice(0, sel.start) + insertion + value.slice(sel.end);
    const pos = sel.start + insertion.length;
    return { value: next, start: pos, end: pos };
  }
  return null;
}

export const WRAP_ON_TYPE: Record<string, [string, string]> = {
  "`": ["`", "`"],
  _: ["_", "_"],
};
