// THE TRAILER STRUCTURAL CHECKER — functions that READ a beat chain.
//
// ─── the one honesty rule, inherited verbatim ───────────────────────────────
//
// **This checker may never report `pass` for something it did not check.**
//
// It is `../gate.ts`'s rule, restated because it is the reason this file exists
// in this shape rather than as another `checks[]` array. `../renders.ts:46-58`
// hand-types twelve verdicts onto each render; not one of them could catch the
// violation that actually shipped, because every one was a sentence a human wrote
// ABOUT the render rather than a function that read it (`../gate.ts:19-35`). The
// registry says the same thing as a law:
//   ai-registry/knowledge/media-generation/_laws.md#unmeasured-is-not-pass
//
// So `unmeasured` is a first-class verdict, it is counted separately, and
// `enforced` reports what fraction of the engaged rules were actually executable.
// The `Verdict` union is imported from `../gate` rather than redeclared, so the
// arithmetic is literally the same arithmetic.
//
// ─── the one thing this checker must NOT become ─────────────────────────────
//
// A gate. The golden path is explicit and it is the subject's central caveat:
//
//   "use the spine as the default and as the diagnostic, never as the gate. A cut
//    that deviates from it is either a specialty-lane choice or a defect, and the
//    structure alone cannot tell you which. What it *can* tell you is that the
//    deviation is real and deliberate — which is the useful thing to surface to a
//    human."
//   — trailer-structure.md § The spine is a default, not a law, and the exception
//     is a lane
//
// That is why `StructureReport.malformed` is `boolean | null` and not `blocked`:
// for a cut that declares the specialty lane it is `null`, and every caller has
// to handle the null rather than reading a green tick. And why the report always
// carries the standing `efficacy` row — "A structural checker can establish that a
// cut is malformed; it cannot establish that a cut works."
//
// ─── what it cannot do, stated rather than hidden ───────────────────────────
//
// It reads DECLARED structure only. It has no access to duration, shot count,
// loudness or image, so every magnitude rule ("the button must be smaller than
// the climax", "the peak must exceed the last rung") is `unmeasured` unless the
// caller injects a magnitude resolver — which is the seam the shot layer fills.
// It also cannot perform the promise ledger's own procedure, whose step 1 is to
// watch the cut "as a stranger … done from ignorance, and anyone who knows the
// work cannot perform it". A checker is never ignorant of its input, so it audits
// declared promises for a payer and reports the extraction itself as unmeasured.
//
// ─── where its numbers come from ────────────────────────────────────────────
//
// Not from here. The thresholds and closed sets this file tests against are read
// from `knowledge/templates/trailer/steps/01-script/params.json`, where each one
// carries its evidence label, the registry path it came from, and the quoted
// line. Before that file existed the rules lived twice — as prose in the step's
// `PATTERNS.md` and as literals in this file — and nothing held the two copies
// together. The params file is the single copy; see the read block below, which
// validates it and throws rather than running a rule it can no longer state.
//
// What stayed OUT of it matters as much: every hedged quantity the doctrine
// gives ("below roughly ten seconds per rung", "two or three rungs", the n=130
// shot-length curve measured on theatrical film trailers) is recorded in that
// file's `not_encoded` block with the source that would settle it. A params file
// is not a laundry: moving a hedge into JSON does not measure it.

import type { Verdict } from "../gate";
import type { TrailerCut } from "./types";
import type { StructureOptions, StructureReport } from "./report";
import { concealmentRow, efficacyRow } from "./report";
import { ADVISORY_RULES } from "./thresholds";
import { checkGraph } from "./rules/graph";
import { checkConnectors } from "./rules/connectors";
import { checkSpine } from "./rules/spine";
import { checkEscalation } from "./rules/escalation";
import { checkReset } from "./rules/reset";
import { checkCue } from "./rules/cue";
import { checkMagnitude } from "./rules/magnitude";
import { checkCards } from "./rules/cards";
import { checkPromises } from "./rules/promises";
import { checkLadder } from "./rules/ladder";
import { checkWithholding } from "./rules/withholding";

// The door. Every symbol this file exported before the split is re-exported here
// with the same name and type; the implementations live in the modules above.
export type { StructureFinding, StructureRule } from "./structureTypes";
export { KIND_LIST_IS_EXHAUSTIVE, RULE_LIST_IS_EXHAUSTIVE } from "./structureTypes";
export { ADVISORY_RULES } from "./thresholds";
export { checkGraph } from "./rules/graph";
export { checkConnectors } from "./rules/connectors";
export { checkSpine } from "./rules/spine";
export { checkEscalation } from "./rules/escalation";
export { checkReset } from "./rules/reset";
export { checkCue } from "./rules/cue";
export type { MagnitudeOf } from "./rules/magnitude";
export { checkMagnitude } from "./rules/magnitude";
export { checkCards } from "./rules/cards";
export { checkPromises } from "./rules/promises";
export { checkLadder } from "./rules/ladder";
export { checkWithholding } from "./rules/withholding";
export type { StructureOptions, StructureReport } from "./report";

export function runStructureCheck(cut: TrailerCut, opts: StructureOptions = {}): StructureReport {
  const findings = [
    ...checkGraph(cut),
    ...checkConnectors(cut),
    ...checkSpine(cut),
    ...checkEscalation(cut),
    ...checkReset(cut),
    ...checkCue(cut),
    ...checkMagnitude(cut, opts.magnitudeOf),
    ...checkCards(cut),
    ...checkPromises(cut),
    ...checkLadder(cut),
    ...checkWithholding(cut, opts.budget),
    concealmentRow(),
    efficacyRow(),
  ];

  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  const violations = count("violation");
  const passes = count("pass");
  const unmeasured = count("unmeasured");
  const testable = passes + violations + unmeasured;

  const blocking = findings.filter(
    (f) => f.verdict === "violation" && !ADVISORY_RULES.includes(f.rule),
  );

  const specialty = cut.lane === "specialty";
  return {
    cutId: cut.id,
    findings,
    violations,
    passes,
    unmeasured,
    notEngaged: count("not-engaged"),
    enforced: testable ? Math.round(((passes + violations) / testable) * 100) : 0,
    malformed: specialty ? null : blocking.length > 0,
    malformedNote: specialty
      ? `This cut declares the specialty lane, where abandoning the spine deliberately is the lane's signature. ${blocking.length} structural deviation(s) are reported above and NONE of them is graded: "a cut that deviates from it is either a specialty-lane choice or a defect, and the structure alone cannot tell you which."`
      : blocking.length > 0
        ? `${blocking.length} structural violation(s) outside the advisory rules (${ADVISORY_RULES.join(", ")}). Malformed is a diagnosis, not a ship gate — the doctrine calls the spine "the default and the diagnostic, never the gate".`
        : `No structural violation outside the advisory rules. This says the cut is well-FORMED. It says nothing about whether it works — see the efficacy row.`,
  };
}
