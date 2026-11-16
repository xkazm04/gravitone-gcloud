// UNDER THE BOOTH (the contest winner "Knockout"): the matches booked next, each a door into the
// booth, and the GPU lane's song-lab jobs - a batch rendering step by step, a post run, a blind
// window being cut - so the one GPU's queue is shown, not implied. Nothing booked is one line.
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { vars } from "../vars.ts";
import type { JobRowView, NextRowView } from "./songlab.ts";
import s from "./Queue.module.css";

export type QueueProps = {
  readonly next: readonly NextRowView[];
  readonly jobs: readonly JobRowView[];
  readonly onOpen?: (row: NextRowView) => void;
};

const SHOWN = 5;

export function Queue({ next, jobs, onOpen }: QueueProps) {
  return (
    <>
      <div className={s.side} data-role="sl-next">
        <div className={s.shead}>
          <span className={s.caps}>booked next</span>
          <Tally value={next.length} label="open" />
        </div>
        {next.length === 0 ? (
          <div className={cx(s.nrow, s.still)}>
            <span className={s.rd}>—</span>
            <span className={s.lb}>no open match</span>
            <span />
          </div>
        ) : (
          next.slice(0, SHOWN).map((n) => (
            <button key={`${n.drawId}-${n.matchId}`} type="button" className={s.nrow} onClick={onOpen === undefined ? undefined : () => onOpen(n)}>
              <span className={s.rd}>{n.round}</span>
              <span className={s.lb}>{n.label}</span>
              <Chip label={n.field} casing="lower" />
            </button>
          ))
        )}
      </div>
      {jobs.length > 0 && (
        <div className={s.side} data-role="sl-jobs">
          <div className={s.shead}>
            <span className={s.caps}>gpu queue</span>
            <Tally value={jobs.length} label="jobs" />
          </div>
          {jobs.map((j) => (
            <div key={j.id} className={cx(s.jrow, j.total > 0 && j.done === j.total && s.done)}>
              <span>{j.label}</span>
              <span className={s.state}>{j.stage === undefined ? `${j.state} · ${j.done} of ${j.total}` : `${j.state} · ${j.stage} · ${j.done} of ${j.total}`}</span>
              <div className={s.bar} role="progressbar" aria-label={j.label} aria-valuemin={0} aria-valuemax={j.total} aria-valuenow={j.done}>
                <i style={vars({ "--f": `${j.total === 0 ? 0 : (j.done / j.total) * 100}%` })} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
