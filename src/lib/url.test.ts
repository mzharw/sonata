import { describe, expect, it } from "vitest";
import { detectUrl, normalizeUrl, urlDomain } from "./url";

describe("detectUrl", () => {
  it("accepts a full URL", () => {
    expect(detectUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(detectUrl("  http://localhost:5173/x  ")).toBe("http://localhost:5173/x");
  });

  it("accepts a bare host", () => {
    expect(detectUrl("github.com/foo/bar")).toBe("github.com/foo/bar");
    expect(detectUrl("example.co.uk")).toBe("example.co.uk");
  });

  // A false positive would silently file a note as a bookmark, so prose must not match.
  it("rejects prose, even prose containing a dot", () => {
    expect(detectUrl("note this.that thing")).toBeUndefined();
    expect(detectUrl("Buy milk")).toBeUndefined();
    expect(detectUrl("read https://example.com later")).toBeUndefined();
    expect(detectUrl("")).toBeUndefined();
  });

  it("rejects a single word with no plausible TLD", () => {
    expect(detectUrl("milk")).toBeUndefined();
    expect(detectUrl("file.x")).toBeUndefined();
  });
});

describe("normalizeUrl", () => {
  it("gives a bare host a scheme so the OS can open it", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("urlDomain", () => {
  it("returns the host without www", () => {
    expect(urlDomain("https://www.example.com/a")).toBe("example.com");
    expect(urlDomain("example.com")).toBe("example.com");
    expect(urlDomain("http://localhost:5173/x")).toBe("localhost");
  });

  it("returns undefined for junk", () => {
    expect(urlDomain("")).toBeUndefined();
    expect(urlDomain("http://")).toBeUndefined();
  });
});
