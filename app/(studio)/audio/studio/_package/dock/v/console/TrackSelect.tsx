"use client";

// THE TRACK SELECTOR INSIDE A PER-TRACK EDITOR (prototype dock-package, "console"): one key per track, its number, its
// title and its lamp for THIS step (block / warn / clear, plus incoming when the agent suggests on that track). The
// pressed key's underline moves between keys (a shared layoutId). Position only - the track index is the editor's.
import { motion } from "motion/react";

import type { ReleaseTrack } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { parseProposalPath, type ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../_release/pending.ts";
import { problemsOnTrack, severityOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import { Lamp, LEVEL_TONE } from "./Instruments.tsx";
import { levelOf } from "./strips.ts";
import s from "./editor.module.css";

export function TrackSelect({ tracks, problems, pending, step, current, onPick, reduce }: {
  readonly tracks: readonly ReleaseTrack[];
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly step: StepId;
  readonly current: number;
  readonly onPick: (index: number) => void;
  readonly reduce: boolean;
}) {
  if (tracks.length < 2) return null;
  return (
    <div className={s.trackSelect} role="group" aria-label="track">
      {tracks.map((t, i) => {
        const sev = severityOf(problemsOnTrack(problems, step, i));
        const level = levelOf(sev);
        const signals = pendingIn(pending, step).filter((p) => parseProposalPath(p.path)?.track === i + 1).length;
        const spoken = [sev.block > 0 ? `${sev.block} block` : "", sev.warn > 0 ? `${sev.warn} warn` : "", signals > 0 ? `${signals} suggested` : ""].filter((x) => x !== "").join(", ");
        return (
          <button key={t.takeId} type="button" className={s.trackKey} aria-pressed={i === current} aria-label={`track ${i + 1}, ${t.title}${spoken === "" ? "" : `, ${spoken}`}`} onClick={() => onPick(i)}>
            <Lamp tone={signals > 0 ? "violet" : LEVEL_TONE[level]} on />
            <span className={s.trackKeyNo} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={s.trackKeyTitle} aria-hidden="true">
              {t.title.trim() === "" ? "untitled" : t.title}
            </span>
            {i === current && (reduce ? <span className={s.trackKeyMark} aria-hidden="true" /> : <motion.span layoutId={`console-track-${step}`} className={s.trackKeyMark} aria-hidden="true" transition={{ type: "spring", stiffness: 500, damping: 40 }} />)}
          </button>
        );
      })}
    </div>
  );
}
