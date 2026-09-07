import type { DropdownOption } from "../components/IconDropdown";
import { IconFlag } from "../components/icons";

export const PRIORITY_OPTIONS: DropdownOption[] = [
  { value: "none", label: "No priority", icon: IconFlag },
  { value: "low", label: "Low", icon: IconFlag, colorVar: "--priority-low" },
  { value: "medium", label: "Medium", icon: IconFlag, colorVar: "--priority-medium" },
  { value: "high", label: "High", icon: IconFlag, colorVar: "--priority-high" },
  { value: "urgent", label: "Urgent", icon: IconFlag, colorVar: "--priority-urgent" },
];
