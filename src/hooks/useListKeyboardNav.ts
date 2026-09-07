import { useEffect, useState, type KeyboardEvent } from "react";

export function useListKeyboardNav(ids: string[]) {
  // Starts with nothing selected. The list is browsable without a row being
  // singled out, and the highlight only appears once the keyboard is actually
  // driving it — so a fresh view doesn't imply the first row is special.
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  // Drop the selection when the row it pointed at leaves the list (filtered
  // out by search, archived, trashed) rather than sliding it onto a neighbour.
  useEffect(() => {
    setActiveId((current) => (current && ids.includes(current) ? current : undefined));
  }, [ids]);

  const move = (delta: number) => {
    if (ids.length === 0) return;
    // First arrow press enters the list from whichever end it came from.
    if (!activeId) {
      setActiveId(delta > 0 ? ids[0] : ids[ids.length - 1]);
      return;
    }
    const index = ids.indexOf(activeId);
    const next = Math.min(Math.max(index + delta, 0), ids.length - 1);
    setActiveId(ids[next]);
  };

  const clear = () => setActiveId(undefined);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActiveId(ids[0]); }
    else if (event.key === "End") { event.preventDefault(); setActiveId(ids[ids.length - 1]); }
  };

  const containerProps = {
    tabIndex: 0,
    role: "listbox",
    "aria-activedescendant": activeId ? `doc-${activeId}` : undefined,
    onKeyDown,
  } as const;

  return { activeId, setActiveId, clear, containerProps };
}
