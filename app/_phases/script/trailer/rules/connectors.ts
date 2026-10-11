// Rule 2 · connectors — `checkConnectors`. "AND THEN must be zero": a chain whose
// adjacencies are all "and then" is a list, not a chain. Split out of
// `../structure.ts` (the door re-exports it).

import type { TrailerCut } from "../types";
import { CITE, type StructureFinding } from "../structureTypes";
import { chain, where } from "../readers";

/* ──────────────────── 2 · connectors — AND THEN must be zero ───────────────
   The neighbouring subject's test, "applying here unchanged and for the same
   reason" (escalation-without-mechanism.md § What a rung is made of), and this
   repo's own first law (`knowledge/CRAFT-BASELINE.md` § 1). `../types.ts:24`
   already says "AND THEN is a defect, drawn as one" — this is the function that
   can say it about a chain nobody hand-annotated. */

export function checkConnectors(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const beats = chain(cut);
  let cleared = 0;

  beats.forEach((b, i) => {
    if (i === 0) {
      if (b.connector !== null) {
        out.push({
          rule: "connector", subject: b.id, verdict: "violation",
          detail: `The first beat declares connector "${b.connector}" — a relationship to a beat that does not exist.`,
          ...where(b), cites: CITE.causality,
        });
      }
      return;
    }
    const prev = beats[i - 1];
    if (b.connector === "AND THEN") {
      out.push({
        rule: "connector", subject: b.id, verdict: "violation",
        detail: `"${prev.label}" AND THEN "${b.label}" — the only honest connector is a sequence, so this is a list, not a chain. "an escalation whose rungs link only with 'and then' is flat for exactly the reason the neighbour gives". Repair is merge, reorder, or find the missing rung that makes one cause the other.`,
        ...where(b), cites: CITE.causality,
      });
      return;
    }
    if (b.connector === null) {
      out.push({
        rule: "connector", subject: b.id, verdict: "unmeasured",
        detail: `No connector declared to "${prev.label}". The relationship was never named, so it cannot be tested — which is not the same as it being causal. Say the connector aloud between the two and write it down.`,
        ...where(b), cites: CITE.causality,
      });
      return;
    }
    cleared++;
  });

  // A `pass` is earned only when at least one adjacency was actually declared and
  // cleared. A one-beat cut, or a chain with every connector left null, examined
  // nothing — and `not-engaged` stays out of the enforced denominator.
  out.push(
    cleared > 0
      ? {
          rule: "connector", subject: "adjacencies", verdict: "pass",
          detail: `${cleared} of ${Math.max(beats.length - 1, 0)} adjacencies carry a declared BUT/THEREFORE and none carries AND THEN.`,
          cites: CITE.causality,
        }
      : {
          rule: "connector", subject: "adjacencies", verdict: "not-engaged",
          detail: `No adjacency carries a declared connector, so nothing was tested. This check examined nothing and does not count as enforcement.`,
          cites: CITE.causality,
        },
  );
  return out;
}
