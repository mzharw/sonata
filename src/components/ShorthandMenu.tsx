import { createPortal } from "react-dom";
import type { Command } from "../lib/mdCommands";

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 320;
const MARGIN = 6;

export interface MenuAnchor {
  top: number;
  left: number;
}

function clamp(anchor: MenuAnchor): MenuAnchor {
  let { top, left } = anchor;
  if (left + MENU_WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - MENU_WIDTH - MARGIN;
  if (left < MARGIN) left = MARGIN;
  if (top + MENU_MAX_HEIGHT > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, window.innerHeight - MENU_MAX_HEIGHT - MARGIN);
  }
  return { top, left };
}

export function ShorthandMenu({
  anchor,
  items,
  highlight,
  onHover,
  onSelect,
  label,
}: {
  anchor: MenuAnchor;
  items: Command[];
  highlight: number;
  onHover: (index: number) => void;
  onSelect: (command: Command) => void;
  label: string;
}) {
  if (items.length === 0) return null;
  const position = clamp(anchor);

  return createPortal(
    <ul className="shorthand-menu" role="listbox" aria-label={label} style={{ top: position.top, left: position.left }}>
      {items.map((command, i) => {
        const Icon = command.icon;
        return (
          <li key={command.id} role="option" aria-selected={i === highlight}>
            <button
              type="button"
              className={i === highlight ? "active" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(command)}
            >
              <Icon size={15} />
              <span className="shorthand-menu-label">{command.label}</span>
              {command.example && <code className="shorthand-menu-example">{command.example}</code>}
            </button>
          </li>
        );
      })}
    </ul>,
    document.body,
  );
}
