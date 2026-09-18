import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";

const MD_OPTS = { gfm: true, breaks: true } as const;

const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M6 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2"></path></svg>';

function decodeCodeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/gi, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" }[entity.toLowerCase()] ?? entity));
}

/** Highlights fenced blocks when their language is supported by highlight.js. */
export function highlightCodeBlocks(html: string): string {
  return html.replace(/<pre><code(?: class="language-([A-Za-z0-9_+-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (_all, language: string | undefined, encodedCode: string) => {
    const normalized = language?.toLowerCase();
    if (!normalized || !hljs.getLanguage(normalized)) return _all;
    const highlighted = hljs.highlight(decodeCodeHtml(encodedCode), { language: normalized, ignoreIllegals: true }).value;
    return `<pre><code class="hljs language-${normalized}">${highlighted}</code></pre>`;
  });
}

/** Adds a small, keyboard-accessible copy button to each fenced code block. */
export function addCodeCopyButtons(html: string): string {
  return highlightCodeBlocks(html).replace(/<pre>(<code[\s\S]*?<\/code>)<\/pre>/g, `<div class="md-code-block"><button type="button" class="md-code-copy" data-copy-code aria-label="Copy code" title="Copy code">${COPY_ICON}</button><pre>$1</pre></div>`);
}

/** Copies the code block associated with a click target, returning whether it succeeded. */
export async function copyCodeFromTarget(target: EventTarget | null): Promise<boolean> {
  if (!(target instanceof Element)) return false;
  const button = target.closest<HTMLElement>("[data-copy-code]");
  if (!button) return false;
  const code = button.closest(".md-code-block")?.querySelector("code")?.textContent;
  if (code === null || code === undefined || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(code);
    button.dataset.copied = "true";
    button.setAttribute("aria-label", "Copied");
    button.setAttribute("title", "Copied");
    window.setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute("aria-label", "Copy code");
      button.setAttribute("title", "Copy code");
    }, 1400);
    return true;
  } catch {
    return false;
  }
}

/** Turns Sonata's stable wiki-link spelling into ordinary Markdown before rendering.
 * The ULID is the identity; the title is only the user-facing label and may be renamed. */
export function renderWikiLinks(source: string): string {
  return source.replace(/\[\[([^\]|]+)\|([0-9A-HJKMNP-TV-Z]{26})\]\]/gi, (_all, title: string, id: string) => `[${title.trim()}](https://sonata.invalid/document/${id})`);
}

/** Renders a snippet of markdown to sanitized HTML, truncating the source first so a huge note doesn't get fully parsed just for a peek. */
export function renderMarkdownPreview(source: string, maxChars = 500, attachmentUrls: Record<string, string> = {}): string {
  const truncated = source.length > maxChars ? `${source.slice(0, maxChars)}…` : source;
  const html = marked.parse(renderWikiLinks(truncated), MD_OPTS) as string;
  const sanitized = DOMPurify.sanitize(html.replace(/(src=")(attachments\/[A-Za-z0-9_./-]+)(")/g, (_all, before: string, path: string, after: string) => `${before}${attachmentUrls[path] ?? path}${after}`));
  // The opener plugin handles target=_blank anchors at the native layer. This remains a
  // reliable system-browser path even where a parent preview click handler is not involved.
  return addCodeCopyButtons(sanitized.replace(/<a href="((?!https:\/\/sonata\.invalid\/document\/)(?:https?:|mailto:)[^"]+)"/gi, '<a target="_blank" rel="noopener noreferrer" href="$1"'));
}
