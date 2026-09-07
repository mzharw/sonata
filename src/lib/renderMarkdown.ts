import { marked } from "marked";
import DOMPurify from "dompurify";

const MD_OPTS = { gfm: true, breaks: true } as const;

/** Renders a snippet of markdown to sanitized HTML, truncating the source first so a huge note doesn't get fully parsed just for a peek. */
export function renderMarkdownPreview(source: string, maxChars = 500, attachmentUrls: Record<string, string> = {}): string {
  const truncated = source.length > maxChars ? `${source.slice(0, maxChars)}…` : source;
  const html = marked.parse(truncated, MD_OPTS) as string;
  return DOMPurify.sanitize(html.replace(/(src=")(attachments\/[A-Za-z0-9_./-]+)(")/g, (_all, before: string, path: string, after: string) => `${before}${attachmentUrls[path] ?? path}${after}`));
}
