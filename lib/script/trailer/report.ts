// The report's shape, the two rows the checker reports as unmeasured, and the options
// it takes. Split out of `structure.ts`; `runStructureCheck` in the door builds the
// report from these pieces and the eleven rule checkers.

import type { WithholdingBudget } from "@/lib/script/trailer/types";
import type { MagnitudeOf } from "@/lib/script/trailer/rules/magnitude";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";

/* ────────────────────────────── the report ────────────────────────────────── */

export interface StructureReport {
  cutId: string;
  findings: StructureFinding[];
  violations: number;
  passes: number;
  unmeasured: number;
  notEngaged: number;
  /** Of the rules that COULD have been executed, how many were. Same arithmetic
   *  as `../gate.ts` — the number that keeps this file honest about its reach. */
  enforced: number;
  /** `null` for a cut that declares the specialty lane. The golden path forbids
   *  reading the spine as a gate there: "the structure alone cannot tell you"
   *  whether a deviation is a choice or a defect. A caller that wants a boolean
   *  must read `findings` and decide, which is the point. */
  malformed: boolean | null;
  /** Why `malformed` is what it is, in one sentence, always populated. */
  malformedNote: string;
}

/** One key per finding, `rule/subject`, with `#2`, `#3` ... on a repeat. Two
 *  violations can share both (a reset that holds two things AND names a mark the
 *  cue lacks; a rung that raises two variables AND repeats its predecessor), and
 *  keyed by `rule/subject` alone they collapse into one: two suggested notes
 *  carried one id, and a plan closing one of the two read as closing neither.
 *  The first occurrence keeps the bare key, so existing ids do not move. */
export function findingKeys(findings: readonly StructureFinding[]): string[] {
  const seen = new Map<string, number>();
  return findings.map((f) => {
    const k = `${f.rule}/${f.subject}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  });
}

export interface StructureOptions {
  /** The shot layer's seam. Without it every magnitude rule reports unmeasured. */
  magnitudeOf?: MagnitudeOf;
  /** The campaign's withholding budget. Without it the budget rule reports
   *  undecided rather than clean. */
  budget?: WithholdingBudget;
}

/** THE SEVENTH TECHNIQUE, WHICH HAD NO ROW AT ALL.
 *
 *  `trailer-structure` forges seven techniques and this file implements six of
 *  them — cue-first-assembly, escalation-without-mechanism, dynamic-reset,
 *  length-ladder, promise-ledger and withholding-budget each have a rule. The
 *  seventh, concealment-and-its-tells, had nothing: not a rule, not a citation,
 *  not a mention. A report listing eleven rules against a subject with seven
 *  techniques reads as complete coverage, and the one technique missing is the
 *  one about hiding things.
 *
 *  IT IS UNMEASURED RATHER THAN CHECKED, and that is the finding, not a
 *  shortcut. The technique's own tell is "a fast cut hiding something is
 *  aesthetically identical to a fast cut as style — the audience cannot
 *  distinguish them". A rule that cannot distinguish them either would have to
 *  invent a duration threshold the doctrine deliberately does not state, and
 *  this file's whole thesis about params.json is that a hedge moved into JSON is
 *  still a hedge: "Moving a hedge into JSON does not measure it; it only hides
 *  the hedge behind a field name."
 *
 *  So it reports itself the way `efficacyRow` does, under
 *  `unmeasured-is-not-pass`: the doctrine governs, the checker cannot test it,
 *  and the row says so rather than the report implying by silence that nothing
 *  governs here. The one part a tool COULD eventually take — the honesty limit,
 *  that a cut for an experiential work must still convey how the work feels to
 *  use — needs a signal about the work that no TrailerCut carries today. That
 *  is the missing instrument, named here rather than left to be rediscovered. */
export function concealmentRow(): StructureFinding {
  return {
    rule: "concealment",
    subject: "is this cut hiding the work",
    verdict: "unmeasured",
    detail:
      "Not decidable from structure. The doctrine's own tell is that a fast cut hiding something is aesthetically identical to a fast cut as style, so no duration or density threshold separates them — and inventing one here would encode a hedge the technique deliberately leaves open. Two of the three modes ARE reachable elsewhere: misleading arrangement is a row the promise ledger must carry (rule `promise`), and what a cut may withhold is priced by rule `withholding`. What neither reaches is the honesty limit — that a cut must still convey how the work feels to use — which needs a signal about the work that no TrailerCut carries.",
    cites: CITE.concealment,
  };
}

/** THE STANDING ROW. "A structural checker can establish that a cut is malformed;
 *  it cannot establish that a cut works … it must report that gap rather than let
 *  a green structural verdict stand in for an unmeasured one." It is emitted on
 *  every report, including a perfect one, and it counts in `unmeasured` — so a
 *  cut can never score `enforced: 100`, which is correct. */
export function efficacyRow(): StructureFinding {
  return {
    rule: "efficacy",
    subject: "does this cut work",
    verdict: "unmeasured",
    detail: `Not measurable from structure. The instrument practitioners actually use is a survey, and almost none of its questions are about the artifact — they ask what the viewer understood, what it reminded them of, what was unclear, and how they would describe it to somebody else. Everything above establishes only that the cut is well-formed or not.`,
    cites: CITE.measurable,
  };
}
