import { marked } from "marked";
import DOMPurify from "dompurify";

const MD_OPTS = { gfm: true, breaks: true } as const;

/** Renders a snippet of markdown to sanitized HTML, truncating the source first so a huge note doesn't get fully parsed just for a peek. */
export function renderMarkdownPreview(source: string, maxChars = 500): string {
  const truncated = source.length > maxChars ? `${source.slice(0, maxChars)}…` : source;
  return DOMPurify.sanitize(marked.parse(truncated, MD_OPTS) as string);
}
