import type { DropdownOption } from "../components/IconDropdown";
import { IconIdea, IconStageDeveloping, IconStageParked, IconStageSpark } from "../components/icons";

/** Leading "none" row so an unset stage names itself, matching `STATUS_OPTIONS`. */
export const STAGE_OPTIONS: DropdownOption[] = [
  { value: "none", label: "No stage", icon: IconIdea },
  { value: "spark", label: "Spark", icon: IconStageSpark, colorVar: "--stage-spark" },
  { value: "developing", label: "Developing", icon: IconStageDeveloping, colorVar: "--stage-developing" },
  { value: "parked", label: "Parked", icon: IconStageParked, colorVar: "--muted-soft" },
];

export const stageLabel = (stage: string): string =>
  STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage;
