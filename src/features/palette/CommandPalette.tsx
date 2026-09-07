import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { native } from "../../lib/native";
import { useUi } from "../../stores/ui";
import { sections } from "../search/views";
import { CREATABLE_TYPES, TYPE_SPECS } from "../../lib/documentTypes";
import { useTypeConversion } from "../../hooks/useTypeConversion";
import { IconMaximize, IconRefresh, IconFolder } from "../../components/icons";
import type { DocumentType } from "../../types/domain";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: ComponentType<{ size?: number }>;
  run: () => void | Promise<unknown>;
}

export function CommandPalette({ close }: { close: () => void }) {
  const ui = useUi();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });
  const { convert } = useTypeConversion();
  // Whatever the user has open is what a conversion command would act on. Reuses the
  // cache key the row's hover preview already fills.
  const openId = ui.fullScreenId ?? ui.expandedId;
  const openDoc = useQuery({
    queryKey: ["preview", openId],
    queryFn: () => native.readDocument(openId!),
    enabled: Boolean(openId),
    staleTime: 60_000,
  });

  const create = async (type: DocumentType, mode: "inline" | "fullscreen" = "inline") => {
    const doc = await native.createDocument({ type, title: `New ${TYPE_SPECS[type].label.toLowerCase()}`, body: "" });
    qc.invalidateQueries({ queryKey: ["documents"] });
    if (mode === "fullscreen") ui.openFullScreen(doc.id);
    else ui.expand(doc.id);
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = CREATABLE_TYPES.map((t) => ({
      id: `new-${t}`,
      label: `New ${TYPE_SPECS[t].label}`,
      icon: TYPE_SPECS[t].icon,
      run: () => create(t),
    }));
    list.push({ id: "new-note-fullscreen", label: "New note (full-screen)", icon: IconMaximize, run: () => create("note", "fullscreen") });
    if (openDoc.data) {
      const open = openDoc.data;
      const spec = TYPE_SPECS[open.type];
      for (const to of spec.convertsTo) {
        list.push({
          id: `convert-${to}`,
          label: `${spec.convertVerb} "${open.title || "Untitled"}" → ${TYPE_SPECS[to].label}`,
          icon: TYPE_SPECS[to].icon,
          run: () => convert({ id: open.id }, to),
        });
      }
    }
    sections.forEach(([view, label]) => {
      list.push({ id: `view-${view}`, label: `Go to ${label}`, run: () => ui.setView(view) });
    });
    for (const { tag, count } of tags.data ?? []) {
      list.push({ id: `tag-${tag}`, label: `Go to #${tag}`, hint: String(count), run: () => ui.setView("tag", tag) });
    }
    list.push({ id: "choose-workspace", label: "Choose workspace…", icon: IconFolder, run: () => native.chooseWorkspace().then(() => qc.invalidateQueries()) });
    list.push({ id: "rebuild-index", label: "Rebuild index", icon: IconRefresh, run: () => native.rebuild().then(() => qc.invalidateQueries()) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags.data, openDoc.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setHighlight(0), [query]);
  useEffect(() => {
    document.querySelector(`.palette-list [data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    void Promise.resolve(cmd.run()).then(close);
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          aria-label="Command palette"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              runAt(highlight);
            } else if (e.key === "Escape") {
              close();
            }
          }}
        />
        <div className="palette-list" role="listbox">
          {filtered.length === 0 && <p className="palette-empty">No matching commands</p>}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                type="button"
                data-index={i}
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? "active" : ""}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => runAt(i)}
              >
                {Icon && <Icon size={14} />}
                <span>{cmd.label}</span>
                {cmd.hint && <small>{cmd.hint}</small>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
