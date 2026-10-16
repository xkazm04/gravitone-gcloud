// A LANE ON HOLD (owner ruling 2026-10-16, COMMON decision 6): a job interrupted on a PAID lane
// may already have spent, so nothing more is claimed on that lane until the operator has looked
// and said so. What is drawn is the work: the lane, the job and the stage it stopped in, and v1's
// own sentence, verbatim - "credits may be spent - look first" (lib/suno and the MV queue switched
// the whole queue off with it). It is a real-error statement, kept as one (CLAUDE.md: real errors
// explain themselves in full). Acknowledge is the one act; it lifts the hold and resumes nothing
// (interrupted jobs never auto-resume).
import type { ResourceLane } from "@gt/domain/lane";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { LaneChip } from "../runs/LaneChip.tsx";
import { when } from "./produce.ts";
import s from "./Acts.module.css";

/** v1's words for an interrupted paid run (lib/suno queue, lib/musicVideo queue). */
export const HOLD_SENTENCE = "credits may be spent - look first";

export type LaneHoldProps = {
  readonly lane: ResourceLane;
  readonly job: string;
  readonly stage?: string;
  readonly since?: string;
  readonly nowMs: number;
  readonly onAck: () => void;
  readonly busy: boolean;
  /** Where the job's own record is (its thread in Runs). */
  readonly href?: string;
};

export function LaneHold({ lane, job, stage, since, nowMs, onAck, busy, href }: LaneHoldProps) {
  return (
    <div className={s.hold} data-component="LaneHold" data-lane={lane} role="group" aria-label={`${lane} on hold`}>
      <div className={s.holdH}>
        <LaneChip lane={lane} />
        <Chip label="hold" tone="rose" dot />
        {since !== undefined && <span className={s.mono}>{when(since, nowMs)}</span>}
      </div>
      <div className={s.holdJob}>
        {href === undefined ? <span>{job}</span> : <a href={href}>{job}</a>}
        {stage !== undefined && <span className={s.mono}>{stage}</span>}
      </div>
      <ErrorLine message={HOLD_SENTENCE} />
      <Button label="Acknowledge" size="sm" tone="rose" onPress={onAck} disabled={busy} shortcut={{ mode: "projects.runs", verb: "ack-lane" }} />
    </div>
  );
}
