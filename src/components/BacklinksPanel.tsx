import { useQuery } from "@tanstack/react-query";
import { native } from "../lib/native";
import { useUi } from "../stores/ui";

/**
 * What links here. Rendered for long-form types only, and absent entirely when nothing
 * does — an empty "Linked from" heading is chrome that never earns its space.
 *
 * Expect sparse results at first: links resolve when their *source* is indexed, so a
 * `[[wikilink]]` written before its target existed stays unresolved until that source is
 * saved again or the index is rebuilt (both reachable from the view menu).
 */
export function BacklinksPanel({ id }: { id: string }) {
  const ui = useUi();
  const backlinks = useQuery({
    queryKey: ["backlinks", id],
    queryFn: () => native.backlinks(id),
    staleTime: 60_000,
  });

  if (!backlinks.data?.length) return null;

  return (
    <section className="backlinks">
      <span className="backlinks-eyebrow">Linked from</span>
      {backlinks.data.map((source) => (
        <button key={source.id} type="button" onClick={() => ui.expand(source.id)}>
          {source.title || "Untitled"}
        </button>
      ))}
    </section>
  );
}
