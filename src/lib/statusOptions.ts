import type { DropdownOption } from "../components/IconDropdown";
import { IconCircle, IconStatusTodo, IconStatusProgress, IconStatusDone, IconX } from "../components/icons";

export const STATUS_OPTIONS: DropdownOption[] = [
  { value: "none", label: "No status", icon: IconCircle },
  { value: "todo", label: "Todo", icon: IconStatusTodo },
  { value: "in_progress", label: "In progress", icon: IconStatusProgress, colorVar: "--status-progress" },
  { value: "completed", label: "Completed", icon: IconStatusDone, colorVar: "--check" },
  { value: "cancelled", label: "Cancelled", icon: IconX, colorVar: "--muted-soft" },
];
