import { useQuery } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";

export function TagChipsBar() {
  const ui = useUi();
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const top = [...(tags.data ?? [])].sort((a, b) => b.count - a.count).slice(0, 15);
  if (top.length === 0) return null;

  const toggleTag = (tag: string) => {
    // A legacy single-tag view is folded into the first chip selection, so
    // adding another tag produces `#work AND #urgent`, not just `#urgent`.
    const current = ui.view === "tag" && ui.tag && !ui.filters.tags?.includes(ui.tag)
      ? [ui.tag, ...(ui.filters.tags ?? [])]
      : (ui.filters.tags ?? []);
    const selected = current.includes(tag);
    const next = selected
      ? current.filter((value) => value !== tag)
      : [...current, tag];

    // These chips are refinements, unlike the tag entries in the view menu.
    // Leave a library view (Tasks, Notes, etc.) intact, but leave a one-tag view
    // so the selected chips remain the complete, visible definition of the query.
    if (ui.view === "tag") ui.setView("all");
    ui.setFilters({ tags: next?.length ? next : undefined });
  };

  return (
    <div className="tag-chips">
      {top.map(({ tag, count }) => {
        const active = ui.filters.tags?.includes(tag) ?? false;
        return (
          <button
            key={tag}
            className={`tag-chip${active ? " active" : ""}`}
            aria-pressed={active}
            title={`${count} items — select with other tags to match all`}
            onClick={() => toggleTag(tag)}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
