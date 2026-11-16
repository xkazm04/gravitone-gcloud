"use client";

// The track picker inside a per-track step (details' people, AI & rights, master): one door per
// track, numbered in release order, carrying the count of THIS step's problems on that track.
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseTrack } from "@gt/domain/release";

import { problemsOnTrack, severityOf, type StepId } from "./steps.ts";
import s from "./step.module.css";

export function TrackStrip({ tracks, problems, step, current, onPick }: {
  readonly tracks: readonly ReleaseTrack[];
  readonly problems: readonly ReleaseProblem[];
  readonly step: StepId;
  readonly current: number;
  readonly onPick: (index: number) => void;
}) {
  return (
    <div className={s.strip} role="group" aria-label="track">
      {tracks.map((t, i) => {
        const sev = severityOf(problemsOnTrack(problems, step, i));
        const spoken = [sev.block > 0 ? `${sev.block} block` : "", sev.warn > 0 ? `${sev.warn} warn` : ""].filter((x) => x !== "").join(", ");
        return (
          <button
            key={t.takeId}
            type="button"
            className={s.stripTrack}
            aria-pressed={i === current}
            aria-label={`track ${i + 1}, ${t.title}${spoken === "" ? "" : `, ${spoken}`}`}
            onClick={() => onPick(i)}
          >
            <span className={s.stripNo} aria-hidden="true">
              {i + 1}
            </span>
            <span className={s.stripTitle} aria-hidden="true">
              {t.title.trim() === "" ? "untitled" : t.title}
            </span>
            {sev.block > 0 && (
              <b className={s.markBlock} aria-hidden="true">
                {sev.block}
              </b>
            )}
            {sev.warn > 0 && (
              <b className={s.markWarn} aria-hidden="true">
                {sev.warn}
              </b>
            )}
          </button>
        );
      })}
    </div>
  );
}
