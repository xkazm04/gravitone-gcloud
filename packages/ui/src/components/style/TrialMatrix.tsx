// THE TRIAL MATRIX, for one style - five trial problems across, each column the style's newest
// answer to that problem under its CURRENT block (v1 app/library/TrialMatrix.tsx drew six
// presets x five problems from a static index; the sheet's coverage pips sat apart from it in
// parts.tsx). Here the two are one object: a column IS a coverage row - its head says whether
// the problem is covered, its face is the plate that covers it (or the outline of one not yet
// rendered), its foot counts the verdicts - and a column is what proof generation takes as its
// unit, so choosing which problems to render is pressing their heads.
//
// Why five problems and not one: "no style can pass all five by being good at one thing"
// (v1 lib/library/trials.ts). A stale plate never stands as a face - the face is what the style
// does NOW - it is counted in the foot as `earlier`.
import type { BlobRef } from "@gt/domain/blob";
import type { StyleCoverageRow, StyleProofView, StyleTrial } from "@gt/domain/styleView";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Plate } from "../desk/Plate.tsx";
import { Ghost } from "../ghost/Ghost.tsx";
import { Tally } from "../tally/Tally.tsx";
import { trialColumns } from "./style.ts";
import s from "./Style.module.css";

export type TrialMatrixProps = {
  readonly trials: readonly StyleTrial[];
  readonly coverage: readonly StyleCoverageRow[];
  readonly proofs: readonly StyleProofView[];
  readonly srcOf: (ref: BlobRef) => string;
  /** The trial ids chosen for the next generation; absent when nothing may be generated. */
  readonly chosen?: ReadonlySet<string>;
  readonly onChoose?: (trialId: string) => void;
  readonly onHold?: (proofId: string) => void;
};

export function TrialMatrix({ trials, coverage, proofs, srcOf, chosen, onChoose, onHold }: TrialMatrixProps) {
  const cols = trialColumns(trials, proofs);
  const covered = new Set(coverage.filter((c) => c.covered).map((c) => c.problem));
  return (
    <div className={s.matrix} role="table" aria-label="trial matrix" data-component="TrialMatrix">
      <div role="row" className={s.mrow}>
        {cols.map((c) => {
          const on = chosen?.has(c.trial.id) ?? false;
          const isCovered = covered.has(c.trial.problem);
          const head = (
            <>
              <span className={s.problem}>{c.trial.problem}</span>
              <span className={s.trialLabel}>{c.trial.label}</span>
              <Chip label={isCovered ? "covered" : "open"} tone={isCovered ? "emerald" : "neutral"} casing="lower" dot={isCovered} />
            </>
          );
          return (
            <div key={c.trial.id} role="columnheader" className={s.mhead} data-trial={c.trial.id} data-covered={isCovered ? "" : undefined}>
              {onChoose === undefined ? (
                head
              ) : (
                <button type="button" className={cx(s.choose, on && s.chosen)} aria-pressed={on} aria-label={`render ${c.trial.label} (${c.trial.problem})`} onClick={() => onChoose(c.trial.id)}>
                  {head}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div role="row" className={s.mrow}>
        {cols.map((c) => (
          <div key={c.trial.id} role="cell" className={s.mcell}>
            {c.face === null ? (
              <Ghost label={`${c.trial.label}: not rendered under this block`} />
            ) : onHold === undefined ? (
              // Nothing to hold: the face is a picture, not a control (as a head is only a button where it chooses).
              <span className={cx(s.face, s.still, s[c.face.state])} role="img" aria-label={`${c.trial.label}: ${c.face.label}, ${c.face.state}`}>
                <Plate className={s.plate} src={srcOf(c.face.media)} alt="" lazy />
              </span>
            ) : (
              <button type="button" className={cx(s.face, s[c.face.state])} onClick={() => onHold(c.face?.id ?? "")} aria-label={`${c.trial.label}: ${c.face.label}, ${c.face.state}`}>
                <Plate className={s.plate} src={srcOf(c.face.media)} alt="" lazy />
              </button>
            )}
            <span className={s.counts}>
              {c.approved > 0 && <Tally value={c.approved} label="approved" />}
              {c.rejected > 0 && <Tally value={c.rejected} label="rejected" />}
              {c.pending > 0 && <Tally value={c.pending} label="undecided" />}
              {c.stale > 0 && <Tally value={c.stale} label="earlier" />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
