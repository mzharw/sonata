import { useQuery } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";

export function TagChipsBar() {
  const ui = useUi();
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const top = [...(tags.data ?? [])].sort((a, b) => b.count - a.count).slice(0, 15);
  if (top.length === 0) return null;

  return (
    <div className="tag-chips">
      {top.map(({ tag, count }) => {
        const active = ui.view === "tag" && ui.tag === tag;
        return (
          <button
            key={tag}
            className={`tag-chip${active ? " active" : ""}`}
            title={`${count} items`}
            onClick={() => (active ? ui.setView("all") : ui.setView("tag", tag))}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
