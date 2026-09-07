import { IconDropdown } from "./IconDropdown";
import { STATUS_OPTIONS } from "../lib/statusOptions";
import type { TaskStatus } from "../types/domain";

export function StatusSelect({ value, onChange, compact }: { value?: TaskStatus; onChange: (status?: TaskStatus) => void; compact?: boolean }) {
  return (
    <IconDropdown
      ariaLabel="Status"
      className="status-dropdown"
      value={value ?? "none"}
      options={STATUS_OPTIONS}
      onChange={(v) => onChange(v === "none" ? undefined : (v as TaskStatus))}
      showLabel={!compact}
      showChevron={!compact}
    />
  );
}
