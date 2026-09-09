import { useEffect, useState } from "react";
import { IconLink, IconExternalLink, IconX } from "./icons";
import { normalizeUrl } from "../lib/url";
import { Tooltip } from "./Tooltip";

/**
 * A bookmark's link. Shaped like `DueDateField`'s trigger row (icon, value, clear) but a
 * plain input rather than a popover — there is nothing to pick.
 */
export function UrlField({
  value,
  onChange,
  onOpen,
}: {
  value: string;
  onChange: (value: string) => void;
  onOpen?: (url: string) => void;
}) {
  // Held locally while typing so a half-typed host is not normalized mid-keystroke; the
  // parent still receives every change and debounces the save itself.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className={`url-field${value ? " has-value" : ""}`}>
      <IconLink size={14} aria-hidden="true" />
      <input
        type="url"
        inputMode="url"
        aria-label="URL"
        placeholder="No link"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => {
          // A bare host needs a scheme before the OS can open it.
          const normalized = normalizeUrl(draft);
          setDraft(normalized);
          if (normalized !== value) onChange(normalized);
        }}
      />
      {value && onOpen && (
        <Tooltip content="Open link in browser"><button
          type="button"
          className="icon-btn"
          aria-label="Open link in browser"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onOpen(normalizeUrl(value))}
        >
          <IconExternalLink size={12} />
        </button></Tooltip>
      )}
      {value && (
        <Tooltip content="Clear link"><button
          type="button"
          className="icon-btn"
          aria-label="Clear link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          <IconX size={11} />
        </button></Tooltip>
      )}
    </div>
  );
}
