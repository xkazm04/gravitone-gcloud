// Rule 9 · the promise ledger — `checkPromises`. Advisory by construction (see
// `ADVISORY_RULES` in `../thresholds.ts`). Split out of `../structure.ts` (the door
// re-exports it).

import type { TrailerCut } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { where } from "@/lib/script/trailer/readers";

/* ──────────────────────── 9 · the promise ledger ──────────────────────────
   ADVISORY BY CONSTRUCTION — see `ADVISORY_RULES` below. "In a tool, make the
   payer a required field … should be surfaced as incomplete rather than accepted",
   and, four lines earlier in the same technique, "As a gate … A system that blocks
   on it will block on correct work; report the rows and let a human read them."
   Both are honoured: the rows are computed, and they never reach `malformed`. */

export function checkPromises(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const rows = cut.beats.flatMap((b) => (b.promises ?? []).map((p) => [b, p] as const));

  for (const [b, p] of rows) {
    if (!p.payer) {
      out.push({
        rule: "promise", subject: p.id, verdict: "violation",
        detail: `Promise "${p.sentence}" (by ${p.source}) names no payer. "A promise with no named payer is a finding, not a maybe" — and it is invisible at approval because everybody in the room already knows the work.`,
        ...where(b), cites: CITE.promise,
      });
    } else if (p.grade === "unpaid") {
      out.push({
        rule: "promise", subject: p.id, verdict: "violation",
        detail: `Promise "${p.sentence}" is graded unpaid against "${p.payer}". "When a promise has no payer, fix the cut, not the promise" — softening the wording leaves the register and the assembly intact, and those made most of it.`,
        ...where(b), cites: CITE.promise,
      });
    } else {
      out.push({
        rule: "promise", subject: p.id, verdict: "pass",
        detail: `Promise "${p.sentence}" names a payer ("${p.payer}")${p.grade ? `, graded ${p.grade}` : ""}.`,
        ...where(b), cites: CITE.promise,
      });
    }
  }

  // Step 4, "separate spend from debt": "Spending is sometimes correct and always a
  // cost." Whether the spend is right is a judgement, so the row is unmeasured.
  for (const [b, p] of rows) {
    if (!p.spentByTheCut) continue;
    out.push({
      rule: "promise", subject: `${p.id}:spent`, verdict: "unmeasured",
      detail: `Promise "${p.sentence}" is spent by the cut itself: delivered inside the promotion, it will not land again when the work ships. Spending is sometimes correct and always a cost; whether this one is worth it is a judgement.`,
      ...where(b), cites: CITE.promise,
    });
  }

  // THE EXTRACTION ITSELF IS NOT AUTOMATABLE, and saying so is the point.
  out.push({
    rule: "promise", subject: "extraction", verdict: "unmeasured",
    detail: `${rows.length} promise(s) are declared on beats. The ledger's own step 1 is to watch the cut as a stranger and write down everything you now believe — "the whole value of the pass is that it is done from ignorance, and anyone who knows the work cannot perform it". A checker is never ignorant of its input, so whether this list is COMPLETE is unmeasured, and promises made by register (cue, grade, rhythm) are outside the beat layer entirely.`,
    cites: CITE.promise,
  });

  return out;
}
