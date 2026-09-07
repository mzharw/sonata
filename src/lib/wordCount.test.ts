import { describe, expect, it } from "vitest";
import { wordCount } from "./wordCount";

describe("wordCount", () => {
  it("counts prose words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("  spaced \n out  ")).toBe(2);
  });

  it("does not count Markdown syntax as words", () => {
    expect(wordCount("**bold** and _italic_")).toBe(3);
    expect(wordCount("# A heading")).toBe(2);
    expect(wordCount("- [ ] a task")).toBe(2);
  });

  it("counts a link's text but not its url", () => {
    expect(wordCount("see [the docs](https://example.com/a/b)")).toBe(3);
    expect(wordCount("![a picture](https://example.com/x.png)")).toBe(0);
    expect(wordCount("see [[Some Note]]")).toBe(3);
    expect(wordCount("see [[path/x|Alias Text]]")).toBe(3);
  });

  it("excludes code, which is not prose the writer is counting", () => {
    expect(wordCount("before\n```\nlet x = one two three\n```\nafter")).toBe(2);
    expect(wordCount("use `npm run dev` now")).toBe(2);
  });

  it("treats a hyphenated or apostrophised word as one", () => {
    expect(wordCount("well-known don't it’s")).toBe(3);
  });
});
