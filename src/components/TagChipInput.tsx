import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { native } from "../lib/native";
import { IconX } from "./icons";

export function TagChipInput({ value, onChange, placeholder, "aria-label": ariaLabel }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string; "aria-label"?: string }) {
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  const tags = useQuery({ queryKey: ["tags"], queryFn: native.tags });

  const suggestions = text.trim()
    ? (tags.data ?? [])
        .filter(({ tag }) => tag.toLowerCase().includes(text.trim().toLowerCase()) && !value.includes(tag))
        .slice(0, 6)
    : [];

  const add = (tag: string) => {
    setText("");
    setHighlight(0);
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const commit = () => add(text.trim());

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className={`chip-input${value.length ? " has-tags" : ""}${focused ? " focused" : ""}`}>
      {value.map((tag) => (
        <span className="chip" key={tag}>
          #{tag}
          <button type="button" className="icon-btn" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}><IconX size={11} /></button>
        </span>
      ))}
      <div className="chip-input-field">
        <input
          aria-label={ariaLabel ?? "Tags"}
          placeholder={text === "" ? (placeholder ?? "+ Tag") : undefined}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setHighlight(0);
            if (e.target.value.endsWith(",")) {
              setText(e.target.value.slice(0, -1));
              commit();
              return;
            }
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions.length > 0) add(suggestions[highlight]?.tag ?? text.trim());
              else commit();
            } else if (e.key === "ArrowDown" && suggestions.length > 0) {
              e.preventDefault();
              setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp" && suggestions.length > 0) {
              e.preventDefault();
              setHighlight((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setText("");
            } else if (e.key === "Backspace" && text === "" && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
        />
        {focused && suggestions.length > 0 && (
          <ul className="chip-suggestions" role="listbox">
            {suggestions.map(({ tag, count }, i) => (
              <li key={tag} role="option" aria-selected={i === highlight}>
                <button type="button" className={i === highlight ? "active" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => add(tag)}>
                  <span>#{tag}</span>
                  <small>{count}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
