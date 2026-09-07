import { useEffect, useMemo, useState } from "react";
import { native } from "../lib/native";

const ATTACHMENT_PATH = /attachments\/[A-Za-z0-9_./-]+/g;

/** Resolves workspace-relative image references through Rust for display in the WebView. */
export function useAttachmentUrls(markdown: string, cover?: string) {
  const paths = useMemo(() => Array.from(new Set([...(markdown.match(ATTACHMENT_PATH) ?? []), ...(cover?.match(ATTACHMENT_PATH) ?? [])])), [markdown, cover]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(paths.map(async (path) => [path, (await native.readAttachment(path)).dataUrl] as const))
      .then((resolved) => {
        if (!cancelled) setUrls(Object.fromEntries(resolved.filter((item): item is [string, string] => Boolean(item[1]))));
      })
      .catch((error: unknown) => {
        // Browser-only development intentionally has no native attachment reader.
        console.warn("Couldn't load note attachments", error);
        if (!cancelled) setUrls({});
      });
    return () => { cancelled = true; };
  }, [paths]);

  return urls;
}
