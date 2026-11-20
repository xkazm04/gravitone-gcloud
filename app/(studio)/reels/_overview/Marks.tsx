// The small marks every /reels view draws beside a reel: its stage, its last verdict, a render's reach, and the
// question that stands in for a poster before a film exists.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import type { ReelRow } from "../_port/types.ts";
import { progressShare, STAGE_LOOK, verdictLook } from "./facts.ts";
import o from "./overview.module.css";

export function StageChip({ stage }: { readonly stage: ReelRow["stage"] }) {
  const look = STAGE_LOOK[stage];
  return <Chip label={look.label} tone={look.tone} dot={look.yours} />;
}

export function VerdictChip({ last }: { readonly last: ReelRow["last"] }) {
  if (last === undefined) return null;
  const v = verdictLook(last);
  return <Chip label={v.label} tone={v.tone} ghost casing="lower" />;
}

/** A render's reach: the face, the frames, a rail that fills; a machine at work shimmers. */
export function RenderReach({ progress }: { readonly progress: NonNullable<ReelRow["progress"]> }) {
  const share = progressShare(progress);
  return (
    <span className={o.reach}>
      <span className={o.reachRail} role="progressbar" aria-label={`${progress.face} render`} aria-valuemin={0} aria-valuemax={progress.frames} aria-valuenow={progress.frame}>
        <span className={o.reachFill} style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </span>
      <span className={o.reachText}>
        {progress.face} {progress.frame.toLocaleString("en-US")} / {progress.frames.toLocaleString("en-US")}
      </span>
    </span>
  );
}

/** Before a film: the reel's question, set as its poster. */
export function HookFace({ row, size = "md" }: { readonly row: Pick<ReelRow, "hook" | "stage">; readonly size?: "sm" | "md" }) {
  return (
    <span className={o.hookFace} data-stage={row.stage} data-size={size}>
      <span className={o.hookText}>{row.hook}</span>
    </span>
  );
}
