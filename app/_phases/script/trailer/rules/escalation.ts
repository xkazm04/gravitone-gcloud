// Rule 4 · the escalation rungs — `checkEscalation`. Each rung raises exactly one
// variable, and no variable repeats consecutively. Split out of `../structure.ts`
// (the door re-exports it).

import type { RaisedVariable, TrailerCut } from "../types";
import { CITE, type StructureFinding } from "../structureTypes";
import { kindsOf, where } from "../readers";
import { RAISES_PER_RUNG } from "../thresholds";

/* ──────────────────────── 4 · the escalation rungs ────────────────────────
   "In a tool, make the raised variable an explicit field. A rung that declares no
   variable, or repeats the previous one, is mechanically detectable — which turns
   the most common structural defect in the form into something a checker can
   surface." — escalation-without-mechanism.md § Decision rules. This is that
   checker, written to that instruction. */

export function checkEscalation(cut: TrailerCut): StructureFinding[] {
  if (cut.moodLed) {
    return [{
      rule: "escalation", subject: "rungs", verdict: "not-engaged",
      detail: `The cut declares moodLed. "A cut built as one sustained emotional gradient rather than a sequence of steps is a recognised and successful shape, and auditing it for rungs will report a defect that is a deliberate choice." Not checked, and deliberately not scored as a pass.`,
      cites: CITE.escalation,
    }];
  }

  const out: StructureFinding[] = [];
  const rungs = kindsOf(cut, "rung");

  if (rungs.length === 0) {
    out.push({
      rule: "escalation", subject: "rungs", verdict: "violation",
      detail: `No rung beats. The escalation is what stops a montage reading as one long beat; with nothing declared as a rung there is no chain to raise anything.`,
      cites: CITE.escalation,
    });
    return out;
  }

  let clean = 0;
  for (const b of rungs) {
    const raises = b.raises ?? [];
    if (raises.length < RAISES_PER_RUNG) {
      out.push({
        rule: "escalation", subject: b.id, verdict: "violation",
        detail: `Rung "${b.label}" declares no raised variable. One of scale / threat / speed / intimacy / cost. A rung that declares none cannot be shown to raise anything, and the doctrine names exactly this as mechanically detectable.`,
        ...where(b), cites: CITE.escalation,
      });
      continue;
    }
    if (raises.length > RAISES_PER_RUNG) {
      out.push({
        rule: "escalation", subject: b.id, verdict: "violation",
        detail: `Rung "${b.label}" raises ${raises.length} variables (${raises.join(", ")}). "It raises exactly one variable … A rung that raises three at once has nothing left for the rung after it."`,
        ...where(b), cites: CITE.escalation,
      });
      continue;
    }
    clean++;
  }

  // Consecutive repeat. Non-consecutive reuse is not a defect — the rule the
  // doctrine states is "check that no variable repeats consecutively".
  for (let i = 1; i < rungs.length; i++) {
    const prev = new Set<RaisedVariable>(rungs[i - 1].raises ?? []);
    const shared = (rungs[i].raises ?? []).filter((v) => prev.has(v));
    if (shared.length) {
      out.push({
        rule: "escalation", subject: rungs[i].id, verdict: "violation",
        detail: `"${rungs[i - 1].label}" and "${rungs[i].label}" both raise ${shared.join(", ")}. "When two rungs raise the same variable, merge them. Two widenings in a row are one widening with extra runtime." This is the flat-escalation failure: content varies, magnitude does not.`,
        ...where(rungs[i]), cites: CITE.escalation,
      });
    }
  }

  if (!out.length) {
    out.push({
      rule: "escalation", subject: "rungs", verdict: "pass",
      detail: `${clean} rungs, each raising exactly one variable (${rungs.map((r) => (r.raises ?? []).join("+")).join(" → ")}), no variable repeated consecutively.`,
      cites: CITE.escalation,
    });
  }
  return out;
}
