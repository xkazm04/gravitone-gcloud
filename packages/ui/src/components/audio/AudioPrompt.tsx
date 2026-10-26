// What an audio take was asked for (prototype library.js :550-551, library.css `.prompt-s`,
// `.neg`, `.dchips`): the prompt as written, in the reading serif - it is somebody's brief and
// is shown whole, never clipped - the exclusions after a rose minus, and the defect codes the
// take was rejected for as rose chips (lib/sound/types.ts DEFECTS; the registry's generated-
// audio defect taxonomy). The heading is the caller's: a detail panel draws its own `h4`.
//
// v1 drew the same three in two places (InspectorRecipe's `draft` pre and InspectorTake's quote);
// the prototype's Library detail is the one that survived.
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Chip } from "../chip/Chip.tsx";
import s from "./AudioPrompt.module.css";

export type AudioPromptProps = {
  readonly prompt: string;
  /** What the brief fenced out (Suno's `exclude`, a negative prompt). */
  readonly negative?: string;
  /** Defect codes, verbatim; an empty list draws nothing. */
  readonly reasons: readonly string[];
};

export function AudioPrompt({ prompt, negative, reasons }: AudioPromptProps) {
  return (
    <div className={s.prompt}>
      {prompt.trim() === "" ? <p className={s.none}>no prompt recorded</p> : <p className={s.text}>{prompt}</p>}
      {negative !== undefined && negative.trim() !== "" && (
        <p className={s.neg}>
          <b aria-hidden="true">−</b>
          <SrOnly text="excluded" /> {negative}
        </p>
      )}
      {reasons.length > 0 && (
        <div className={s.chips} role="list" aria-label="reject reasons">
          {reasons.map((r) => (
            <span key={r} role="listitem">
              <Chip label={r} tone="rose" casing="lower" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
