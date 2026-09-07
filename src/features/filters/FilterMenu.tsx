import { useEffect, useRef, useState } from "react";
import { useUi, activeFilterCount, type Filters } from "../../stores/ui";
import { STATUS_OPTIONS } from "../../lib/statusOptions";
import { PRIORITY_OPTIONS } from "../../lib/priorityOptions";
import { IconFilter, IconCheck } from "../../components/icons";
import type { Priority, SortOrder, TaskStatus } from "../../types/domain";

const SORT_OPTIONS: Array<[SortOrder, string]> = [
  ["default", "Due date"],
  ["updated", "Recently updated"],
  ["created", "Recently created"],
  ["priority", "Priority"],
  ["title", "Title A–Z"],
];

// "No status" / "No priority" are real values to filter on elsewhere in the app,
// but here the unset choice means "don't filter", so the lists carry their own
// leading "Any" row instead.
const STATUS_FILTERS = STATUS_OPTIONS.filter((o) => o.value !== "none");

function Row({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} className={selected ? "active" : undefined} onClick={onSelect}>
      <span>{label}</span>
      {selected && <IconCheck size={13} />}
    </button>
  );
}

export function FilterMenu() {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { filters } = ui;
  const narrowing = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const set = (patch: Partial<Filters>) => ui.setFilters(patch);
  const sortLabel = SORT_OPTIONS.find(([value]) => value === filters.sort)?.[1];
  const summary = [
    narrowing > 0 ? `${narrowing} filter${narrowing > 1 ? "s" : ""}` : undefined,
    sortLabel ? `sorted by ${sortLabel.toLowerCase()}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="filter-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className={`icon-btn filter-menu-trigger${narrowing > 0 ? " has-filters" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter and sort — ${summary}`}
        title={`Filter and sort — ${summary}`}
        onClick={() => setOpen((o) => !o)}
      >
        <IconFilter size={15} />
        {narrowing > 0 && <span className="filter-menu-count" aria-hidden="true">{narrowing}</span>}
      </button>
      {open && (
        <div className="filter-menu-popover" role="menu">
          <p className="eyebrow">STATUS</p>
          <nav>
            <Row label="Any status" selected={!filters.status} onSelect={() => set({ status: undefined })} />
            {STATUS_FILTERS.map((option) => (
              <Row
                key={option.value}
                label={option.label}
                selected={filters.status === option.value}
                onSelect={() => set({ status: option.value as TaskStatus })}
              />
            ))}
          </nav>
          <p className="eyebrow">PRIORITY</p>
          <nav>
            <Row label="Any priority" selected={!filters.priority} onSelect={() => set({ priority: undefined })} />
            {PRIORITY_OPTIONS.map((option) => (
              <Row
                key={option.value}
                label={option.value === "none" ? "None" : option.label}
                selected={filters.priority === option.value}
                onSelect={() => set({ priority: option.value as Priority })}
              />
            ))}
          </nav>
          <p className="eyebrow">SORT BY</p>
          <nav>
            {SORT_OPTIONS.map(([value, label]) => (
              <Row key={value} label={label} selected={filters.sort === value} onSelect={() => set({ sort: value })} />
            ))}
          </nav>
          {(narrowing > 0 || filters.sort !== "default") && (
            <button type="button" className="filter-menu-reset" onClick={() => ui.resetFilters()}>
              Reset to defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}
