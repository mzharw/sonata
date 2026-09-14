import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { IconSearch, IconX } from "../../components/icons";

export function TagChipsBar() {
  const ui = useUi();
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const [browseOpen, setBrowseOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sortedTags = useMemo(() => [...(tags.data ?? [])].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)), [tags.data]);
  const selectedTags = [...new Set([...(ui.filters.tags ?? []), ...(ui.view === "tag" && ui.tag ? [ui.tag] : [])])];
  const popular = sortedTags.slice(0, 8);
  const visible = [...popular, ...sortedTags.filter(({ tag }) => selectedTags.includes(tag) && !popular.some((item) => item.tag === tag))];
  const matches = sortedTags.filter(({ tag }) => tag.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!browseOpen) return;
    searchRef.current?.focus();
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setBrowseOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBrowseOpen(false);
        searchRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [browseOpen]);
  if (sortedTags.length === 0) return null;

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
    <div className="tag-chips" ref={containerRef}>
      <span className="tag-chips-label">Tags</span>
      <div className="tag-chips-scroll" aria-label="Popular tags">
        {visible.map(({ tag, count }) => {
          const active = selectedTags.includes(tag);
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
      {sortedTags.length > popular.length && <button type="button" className="tag-browse-trigger" aria-expanded={browseOpen} onClick={() => setBrowseOpen((open) => !open)}>
        {browseOpen ? "Close" : `All tags · ${sortedTags.length}`}
      </button>}
      {browseOpen && <div className="tag-browser" role="dialog" aria-label="Browse all tags">
        <div className="tag-browser-search">
          <IconSearch size={14} />
          <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a tag" aria-label="Find a tag" />
          {search && <button type="button" className="icon-btn" aria-label="Clear tag search" onClick={() => setSearch("")}><IconX size={13} /></button>}
        </div>
        <div className="tag-browser-list">
          {matches.length ? matches.map(({ tag, count }) => {
            const active = selectedTags.includes(tag);
            return <button type="button" key={tag} className={`tag-browser-item${active ? " active" : ""}`} aria-pressed={active} onClick={() => toggleTag(tag)}><span>#{tag}</span><small>{count}</small></button>;
          }) : <p className="tag-browser-empty">No tags found</p>}
        </div>
      </div>}
    </div>
  );
}
