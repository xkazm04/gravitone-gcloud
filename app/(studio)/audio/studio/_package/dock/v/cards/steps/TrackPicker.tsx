"use client";

// THE TRACK PICKER inside a per-track card: one numbered chip per track carrying this step's problem and suggestion
// counts on it, the current one lit by a mark that springs between them.
import { motion, useReducedMotion } from "motion/react";

import type { ReleaseTrack } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { parseProposalPath, type ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../../_release/pending.ts";
import { problemsOnTrack, severityOf, type StepId } from "../../../../../../_release/wizard/steps.ts";
import { FOLD } from "../motion.ts";
import s from "./steps.module.css";

export function TrackPicker({ tracks, problems, pending, step, current, onPick }: {
  readonly tracks: readonly ReleaseTrack[];
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly step: StepId;
  readonly current: number;
  readonly onPick: (index: number) => void;
}) {
  const reduce = useReducedMotion() === true;
  return (
    <div className={s.picker} role="group" aria-label="track">
      {tracks.map((t, i) => {
        const sev = severityOf(problemsOnTrack(problems, step, i));
        const suggested = pendingIn(pending, step).filter((p) => parseProposalPath(p.path)?.track === i + 1).length;
        const spoken = [sev.block > 0 ? `${sev.block} block` : "", sev.warn > 0 ? `${sev.warn} warn` : "", suggested > 0 ? `${suggested} suggested` : ""].filter((x) => x !== "").join(", ");
        const tone = sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : suggested > 0 ? "agent" : undefined;
        return (
          <button key={t.takeId} type="button" className={s.pick2} data-tone={tone} aria-pressed={i === current} aria-label={`track ${i + 1}, ${t.title}${spoken === "" ? "" : `, ${spoken}`}`} onClick={() => onPick(i)}>
            {i === current && (reduce ? <span className={s.pickMark} /> : <motion.span layoutId="cards-track-mark" className={s.pickMark} transition={FOLD} />)}
            <span className={s.pickNo} aria-hidden="true">
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
