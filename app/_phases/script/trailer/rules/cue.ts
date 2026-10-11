// Rule 6 · the cue — `checkCue`. Whether the acts have cue marks to sit on at all.
// Split out of `../structure.ts` (the door re-exports it).

import type { TrailerCut } from "../types";
import { CITE, type StructureFinding } from "../structureTypes";
import { where } from "../readers";

/* ───────────────────────────── 6 · the cue ────────────────────────────────
   "In a tool, model the cue as the timeline's parent, not as a track."
   The checks here are about whether the acts have marks to sit on at all. */

export function checkCue(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const cue = cut.cue;

  if (!cue) {
    out.push({
      rule: "cue", subject: "cue", verdict: "unmeasured",
      detail: `The cut declares no cue. In this form "the cue is the structure and the picture is fitted to it" — act boundaries ARE cue boundaries — so with no cue there is nothing marking where the acts fall and every boundary rule here is measured against positions the music does not mark. Not a violation: a plan may legitimately precede a cue. It is also not a pass.`,
      cites: CITE.cue,
    });
    return out;
  }

  const byId = new Map(cue.sections.map((s) => [s.id, s] as const));
  for (const m of cut.movements) {
    if (!m.cueSection) {
      out.push({
        rule: "cue", subject: m.id, verdict: "unmeasured",
        detail: `Movement "${m.label}" sits on no cue section. "a boundary the music does not mark is a boundary the viewer cannot perceive" — this act boundary is unverifiable rather than wrong.`,
        cites: CITE.cue,
      });
    } else if (!byId.has(m.cueSection)) {
      out.push({
        rule: "cue", subject: m.id, verdict: "violation",
        detail: `Movement "${m.label}" names cue section "${m.cueSection}", which cue "${cue.title}" does not contain.`,
        cites: CITE.graph,
      });
    }
  }

  for (const b of cut.beats) {
    if (b.cueMark && !byId.has(b.cueMark)) {
      out.push({
        rule: "cue", subject: b.id, verdict: "violation",
        detail: `Beat "${b.label}" names cue mark "${b.cueMark}", which cue "${cue.title}" does not contain.`,
        ...where(b), cites: CITE.graph,
      });
    }
  }

  // "When a cue has no breath before its peak, reject it however good it sounds.
  // There is nowhere to put the reset, and the cut will have no climax."
  const peakIdx = cue.sections.findIndex((s) => s.kind === "peak");
  if (peakIdx < 0) {
    out.push({
      rule: "cue", subject: cue.id, verdict: "violation",
      detail: `Cue "${cue.title}" declares no peak section. The cut's climax has no musical arrival to sit on.`,
      cites: CITE.cue,
    });
  } else if (!cue.sections.slice(0, peakIdx).some((s) => s.isBoundary)) {
    out.push({
      rule: "cue", subject: cue.id, verdict: "violation",
      detail: `Cue "${cue.title}" has no boundary before its peak. "When a cue has no breath before its peak, reject it however good it sounds. There is nowhere to put the reset, and the cut will have no climax."`,
      cites: CITE.cue,
    });
  } else {
    out.push({
      rule: "cue", subject: cue.id, verdict: "pass",
      detail: `Cue "${cue.title}" has a boundary before its peak, so the reset has somewhere to land.`,
      cites: CITE.cue,
    });
  }
  return out;
}
