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

import { NOTEBOOK, UNKNOWN_BY_ID } from "../_shared/notebook/notebook";
import { asSource, type NotebookSource } from "../_shared/notebook/source";
import type { Notebook, Unknown } from "../_shared/notebook/types";
import type { ScriptDraft, DraftRender } from "./draft";
import { checkConstraints, probesFor, type GateFinding, type GateSubject } from "./gate";
import { RENDER_BY_ID } from "./renders";

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

/** The HAND ledger for one render, as the notebook stands today: typed states,
 *  typed `how`. Superseded by `ledgerFor` below, which derives every state from
 *  the gate; this survives only because the ConstraintLedger panel and
 *  pipeline/drive-script-step.mjs ("the reversal chain still declares its
 *  at-risk row") read it, and moving them is script-phase-A session 2. Measured
 *  2026-10-05: it disagrees with the gate on reversal-chain · u-yield-causality
 *  (typed at-risk; the render was corrected, and the gate passes it). */
export function handLedgerFor(renderId: string): ResolvedLedger {
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

/* ───────────────────────── the ledger, derived from the gate ────────────────
   script-phase-A. The table above is "a well-designed noun with no verb"
   (gate.ts's header): a person typed `honoured` or `at-risk` and nothing ever
   re-read the render. Two verdict sources for one question will disagree, and
   on 2026-10-05 they do. So the STATE now comes from the gate's constraint
   check, run against the render and the notebook handed in; a person's `how`
   survives as an annotation beside it, and is never the verdict. */

/** The gate's verdict, in the ledger's words. `not-engaged`: the probe's rule
 *  never engaged because the render does not raise the subject. `unmeasured`:
 *  the unknown has no probe, so nothing was checked — never scored honoured. */
export type LedgerState = "honoured" | "at-risk" | "not-engaged" | "unmeasured";
export type LedgerEffective = LedgerState | "superseded";

export interface DerivedRow {
  unknownId: string;
  unknown: Unknown;
  state: LedgerState;
  effective: LedgerEffective;
  /** The person's note when the draft carries one, else the gate's detail. */
  how: string;
  /** Where the violation sits, when it is locatable. */
  at?: string;
  quote?: string;
}

export interface DerivedLedger {
  /** One row per notebook unknown, in notebook order. */
  rows: DerivedRow[];
  /** Notes naming an unknown this notebook does not have. */
  dangling: string[];
  atRisk: number;
  superseded: number;
  unmeasured: number;
}

const STATE: Record<GateFinding["verdict"], LedgerState> = {
  pass: "honoured",
  violation: "at-risk",
  "not-engaged": "not-engaged",
  unmeasured: "unmeasured",
};

/** Score one render against a notebook, through the gate.
 *
 *  `render` is an id (resolved in `opts.draft`, then the fixture) or the render
 *  itself — any `GateSubject`, so an unaccepted rewrite can be scored. Probes
 *  resolve through `probesFor(unknowns, draft)`. */
export function ledgerFor(
  render: string | GateSubject | DraftRender,
  notebook: NotebookSource | Notebook = NOTEBOOK,
  opts: { draft?: Pick<ScriptDraft, "renders" | "probes"> } = {},
): DerivedLedger {
  const subject: GateSubject | DraftRender | undefined =
    typeof render === "string" ? (opts.draft?.renders.find((r) => r.id === render) ?? RENDER_BY_ID[render]) : render;
  if (!subject) throw new Error(`ledgerFor: no render "${String(render)}" in the draft or the fixture.`);

  const nb = asSource(notebook).notebook;
  const own = (subject as Partial<DraftRender>).ledgerNotes;
  const notes: Record<string, string> =
    own ?? Object.fromEntries((CONSTRAINT_LEDGER[subject.id] ?? []).map((r) => [r.unknownId, r.how]));

  const findings = checkConstraints(subject, nb.unknowns, probesFor(nb.unknowns, opts.draft));
  const rows: DerivedRow[] = nb.unknowns.map((unknown) => {
    const mine = findings.filter((f) => f.subject === unknown.id);
    // A violation anywhere outranks every pass: one forbidden figure is the verdict.
    const f = mine.find((x) => x.verdict === "violation") ?? mine[0];
    const state: LedgerState = f ? STATE[f.verdict] : "unmeasured";
    return {
      unknownId: unknown.id,
      unknown,
      state,
      // A resolved unknown no longer binds: honouring it is a render more
      // cautious than its research now requires, not a pass.
      effective: unknown.resolvedBy && state === "honoured" ? "superseded" : state,
      how: notes[unknown.id] ?? f?.detail ?? "",
      ...(f?.at ? { at: f.at } : {}),
      ...(f?.quote ? { quote: f.quote } : {}),
    };
  });

  const ids = new Set(nb.unknowns.map((u) => u.id));
  return {
    rows,
    dangling: Object.keys(notes).filter((id) => !ids.has(id)),
    atRisk: rows.filter((r) => r.effective === "at-risk").length,
    superseded: rows.filter((r) => r.effective === "superseded").length,
    unmeasured: rows.filter((r) => r.effective === "unmeasured").length,
  };
}
