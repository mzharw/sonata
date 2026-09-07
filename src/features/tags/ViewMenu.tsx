import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { IconChevronDown, IconChevronUp, IconCommand, IconRefresh } from "../../components/icons";

export function ViewMenu() {
  const ui = useUi();
  const qc = useQueryClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const label = ui.view === "tag" ? `# ${ui.tag}` : sections.find(([view]) => view === ui.view)?.[1];

  return (
    <div className="view-menu" ref={containerRef}>
      <button ref={triggerRef} className="view-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label} {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </button>
      {open && (
        <div className="view-menu-popover" role="menu">
          <p className="eyebrow">LIBRARY</p>
          <nav>
            {/* The status views live in the filter menu now; the command palette
                still lists every one of them by name. */}
            {sections.filter(([, , , group]) => group !== "status").map(([view, viewLabel]) => (
              <button key={view} className={ui.view === view ? "active" : ""} onClick={() => { ui.setView(view); setOpen(false); }}>
                {viewLabel}
              </button>
            ))}
          </nav>
          <p className="eyebrow">TAGS</p>
          <div className="tags">
            {tags.data?.map(({ tag, count }) => (
              <button key={tag} className={ui.view === "tag" && ui.tag === tag ? "active" : ""} onClick={() => { ui.setView("tag", tag); setOpen(false); }}>
                <span># {tag}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>
          <footer>
            <button onClick={() => { ui.setPalette(true); setOpen(false); }}><IconCommand size={14} /> Command palette</button>
            <button onClick={() => void native.rebuild().then(() => qc.invalidateQueries())}><IconRefresh size={14} /> Rebuild index</button>
          </footer>
        </div>
      )}
    </div>
  );
}
