import type { DropdownOption } from "../components/IconDropdown";
import { IconIdea, IconStatusProgress, IconMinus } from "../components/icons";

/** Leading "none" row so an unset stage names itself, matching `STATUS_OPTIONS`. */
export const STAGE_OPTIONS: DropdownOption[] = [
  { value: "none", label: "No stage", icon: IconIdea },
  { value: "spark", label: "Spark", icon: IconIdea, colorVar: "--stage-spark" },
  { value: "developing", label: "Developing", icon: IconStatusProgress, colorVar: "--stage-developing" },
  { value: "parked", label: "Parked", icon: IconMinus, colorVar: "--muted-soft" },
];

export const stageLabel = (stage: string): string =>
  STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage;
