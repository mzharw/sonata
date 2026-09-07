/**
 * URL handling for the bookmark type. Deliberately conservative: Quick Add switches the
 * capture type on a detected URL, so a false positive would silently file a note as a
 * bookmark. A bare host only counts when its suffix looks like a real TLD.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
// Two-or-more letters, so "this.that" in prose does not read as a host.
const BARE_HOST = /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

/** The single URL in `text`, or `undefined` when it is not just a link. */
export function detectUrl(text: string): string | undefined {
  const token = text.trim();
  // More than one word means prose that happens to contain a link, which is a note.
  if (!token || /\s/.test(token)) return undefined;
  if (SCHEME.test(token)) return token;
  return BARE_HOST.test(token) ? token : undefined;
}

/** Stores a bare host as a real URL so the open action has something to hand the OS. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** The host, for the row's domain chip. `www.` is noise at chip size. */
export function urlDomain(value: string): string | undefined {
  try {
    const { hostname } = new URL(normalizeUrl(value));
    return hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}
