// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdownPreview } from "./renderMarkdown";

describe("renderMarkdownPreview", () => {
  it("marks ordinary external links for the native opener", () => {
    const html = renderMarkdownPreview("[Google](https://www.google.com)");

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://www.google.com"');
  });

  it("does not send Sonata document links to the external opener", () => {
    const html = renderMarkdownPreview("[[A note|01ARZ3NDEKTSV4RRFFQ69G5FAV]]");

    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="https://sonata.invalid/document/01ARZ3NDEKTSV4RRFFQ69G5FAV"');
  });

  it("adds a copy button to fenced code blocks", () => {
    const html = renderMarkdownPreview("```ts\nconst answer = 42;\n```");
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

    expect(html).toContain('data-copy-code');
    expect(html).toContain('aria-label="Copy code"');
    expect(text).toContain("const answer = 42;");
  });

  it("highlights fenced blocks with a supported language", () => {
    const html = renderMarkdownPreview("```js\nconst answer = 42;\n```");

    expect(html).toContain('class="hljs language-js"');
    expect(html).toContain('class="hljs-keyword"');
  });
});
