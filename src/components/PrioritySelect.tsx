import { IconDropdown } from "./IconDropdown";
import { PRIORITY_OPTIONS as OPTIONS } from "../lib/priorityOptions";
import type { Priority } from "../types/domain";

export function PrioritySelect({ value, onChange }: { value?: Priority; onChange: (priority?: Priority) => void }) {
  return (
    <IconDropdown
      ariaLabel="Priority"
      className="priority-dropdown"
      value={value ?? "none"}
      options={OPTIONS}
      onChange={(v) => onChange(v as Priority)}
    />
  );
}
