// THE CONSTRAINT LEDGER — every notebook `unknown` carries an `impact`, which
// is a rule about what the script may not say. Nothing in the library's UI
// contract checks a render against them, so this is the step's own invention:
// each render, scored against the limits the research declared.
//
// ─── why this file exists separately, and keys by id ────────────────────────
//
// The ledger used to address unknowns BY ARRAY INDEX, inline in renders.ts.
// Follow-up round 1 resolved one unknown and the array shrank from four to
// three — so every stored index quietly pointed one slot to the left, and the
// last one pointed at nothing at all. `NOTEBOOK.unknowns[3]` was `undefined` and
// reading `.impact` off it crashed the whole Script step.
//
// Two changes, both structural rather than a null check:
//   1. Rows name an unknown by `id`, so deleting a neighbour cannot re-aim them.
//   2. Resolved unknowns are kept in the notebook rather than deleted, so the
//      ledger stays complete and a render written under an old constraint can
//      be seen to be over-hedged instead of silently losing its row.
//
// A row that still cannot resolve is REPORTED, not dropped — a ledger that
// quietly renders four rows as three is the same defect wearing a guard clause.

import { UNKNOWN_BY_ID } from "../_shared/notebook/notebook";
import type { Unknown } from "../_shared/notebook/types";

export type ConstraintState = "honoured" | "at-risk" | "not-applicable";

/** What the row means once the notebook's current state is applied.
 *  `superseded` = the render obeys a constraint that has since been lifted. Not
 *  a violation; a render that is now more cautious than the evidence requires. */
export type EffectiveState = ConstraintState | "superseded";

interface LedgerRow {
  unknownId: string;
  state: ConstraintState;
  how: string;
}

export const CONSTRAINT_LEDGER: Record<string, LedgerRow[]> = {
  "reversal-chain": [
    { unknownId: "u-cohorts", state: "honoured", how: "both readings used, neither made decisive — distribution in M1, accumulation in the steel-man" },
    { unknownId: "u-spot-price", state: "honoured", how: "“roughly half its value” — no spot figure anywhere in the render" },
    { unknownId: "u-liquidity-vendor", state: "honoured", how: "the 93% / 7.6x vendor figures were cut entirely" },
    { unknownId: "u-yield-causality", state: "at-risk", how: "“when Treasury yields climbed … Bitcoin was sold” reads as causation. The notebook only measured correlation and asks for “moves with”. One clause away from compliant." },
  ],
  adjudication: [
    { unknownId: "u-cohorts", state: "honoured", how: "the accumulation figure is candidate 1's own evidence, weighed against the distribution figure rather than beating it" },
    { unknownId: "u-spot-price", state: "honoured", how: "“roughly half that” — the ATH is quoted, the current price never is" },
    { unknownId: "u-liquidity-vendor", state: "honoured", how: "cut, same as the other render — the notebook's confidence rating held across both" },
    { unknownId: "u-yield-causality", state: "honoured", how: "candidate 4's verdict explicitly refuses the causal claim: it “describes the weather”" },
  ],
  "derived-short": [
    { unknownId: "u-cohorts", state: "not-applicable", how: "no on-chain cohort claim in the clip" },
    { unknownId: "u-spot-price", state: "honoured", how: "“down fifty percent” is a ratio, not a level" },
    { unknownId: "u-liquidity-vendor", state: "not-applicable", how: "no liquidity claim" },
    { unknownId: "u-yield-causality", state: "not-applicable", how: "no macro claim — the clip is entirely mechanical" },
  ],
};

export interface ResolvedRow {
  unknownId: string;
  unknown: Unknown;
  state: ConstraintState;
  effective: EffectiveState;
  how: string;
}

export interface ResolvedLedger {
  rows: ResolvedRow[];
  /** Rows naming an unknown the notebook no longer has. Surfaced, never hidden:
   *  it means the render was scored against a rule that has vanished, and the
   *  score is therefore incomplete. */
  dangling: string[];
  atRisk: number;
  superseded: number;
}

/** Score one render against the notebook as it stands today. */
export function ledgerFor(renderId: string): ResolvedLedger {
  const raw = CONSTRAINT_LEDGER[renderId] ?? [];
  const rows: ResolvedRow[] = [];
  const dangling: string[] = [];

  for (const r of raw) {
    const unknown = UNKNOWN_BY_ID[r.unknownId];
    if (!unknown) {
      dangling.push(r.unknownId);
      continue;
    }
    // A constraint that has been resolved no longer binds. Honouring it is not
    // a pass any more — it is a render that is out of date with its own
    // research, which is the thing this ledger is for.
    const effective: EffectiveState =
      unknown.resolvedBy && r.state === "honoured" ? "superseded" : r.state;
    rows.push({ unknownId: r.unknownId, unknown, state: r.state, effective, how: r.how });
  }

  return {
    rows,
    dangling,
    atRisk: rows.filter((r) => r.effective === "at-risk").length,
    superseded: rows.filter((r) => r.effective === "superseded").length,
  };
}
