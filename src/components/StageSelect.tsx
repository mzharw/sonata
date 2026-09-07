import { IconDropdown } from "./IconDropdown";
import { STAGE_OPTIONS } from "../lib/stageOptions";
import type { IdeaStage } from "../types/domain";

export function StageSelect({ value, onChange, compact }: { value?: IdeaStage; onChange: (stage?: IdeaStage) => void; compact?: boolean }) {
  return (
    <IconDropdown
      ariaLabel="Stage"
      className="stage-dropdown"
      value={value ?? "none"}
      options={STAGE_OPTIONS}
      onChange={(v) => onChange(v === "none" ? undefined : (v as IdeaStage))}
      showLabel={!compact}
      showChevron={!compact}
    />
  );
}
