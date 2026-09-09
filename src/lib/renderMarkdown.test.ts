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
});
