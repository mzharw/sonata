import { marked } from "marked";
import DOMPurify from "dompurify";

const MD_OPTS = { gfm: true, breaks: true } as const;

/** Turns Sonata's stable wiki-link spelling into ordinary Markdown before rendering.
 * The ULID is the identity; the title is only the user-facing label and may be renamed. */
export function renderWikiLinks(source: string): string {
  return source.replace(/\[\[([^\]|]+)\|([0-9A-HJKMNP-TV-Z]{26})\]\]/gi, (_all, title: string, id: string) => `[${title.trim()}](https://sonata.invalid/document/${id})`);
}

/** Renders a snippet of markdown to sanitized HTML, truncating the source first so a huge note doesn't get fully parsed just for a peek. */
export function renderMarkdownPreview(source: string, maxChars = 500, attachmentUrls: Record<string, string> = {}): string {
  const truncated = source.length > maxChars ? `${source.slice(0, maxChars)}…` : source;
  const html = marked.parse(renderWikiLinks(truncated), MD_OPTS) as string;
  return DOMPurify.sanitize(html.replace(/(src=")(attachments\/[A-Za-z0-9_./-]+)(")/g, (_all, before: string, path: string, after: string) => `${before}${attachmentUrls[path] ?? path}${after}`));
}
