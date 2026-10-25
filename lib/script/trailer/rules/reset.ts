// Rule 5 · the dynamic reset — `checkReset`. Everything is anchored to the peak,
// including the refusals. Split out of `../structure.ts` (the door re-exports it).

import type { TrailerCut } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { chain, dropped, kindsOf, where } from "@/lib/script/trailer/readers";
import { HOLDS_PER_RESET, RESETS_TOO_MANY, STRUCTURAL_RESETS } from "@/lib/script/trailer/thresholds";

/* ───────────────────────── 5 · the dynamic reset ──────────────────────────
   "Locate the peak first. The reset has no position of its own; it sits
   immediately before whatever the cut's largest moment is." — dynamic-reset.md
   § Procedure. Everything here is anchored to the peak, including the refusals. */

export function checkReset(cut: TrailerCut): StructureFinding[] {
  if (cut.moodLed) {
    return [{
      rule: "reset", subject: "reset", verdict: "not-engaged",
      detail: `The cut declares moodLed. "A cut built as one sustained gradient has nothing to reset before, and inserting a stop invents a structure the piece deliberately does not have." Not checked.`,
      cites: CITE.reset,
    }];
  }
  if (dropped(cut, "reset")) {
    return [{
      rule: "reset", subject: "reset", verdict: "not-engaged",
      detail: `The reset is declared dropped for this ${cut.rung}. It is item 4 in the ladder's drop order — "At around thirty seconds there is no dynamic range to reset and the gap costs a tenth of the runtime." A declared absence is not a defect and is also not a pass.`,
      cites: CITE.ladder,
    }];
  }

  const out: StructureFinding[] = [];
  const beats = chain(cut);
  const resets = kindsOf(cut, "reset");
  const peaks = kindsOf(cut, "peak");

  if (resets.length < STRUCTURAL_RESETS) {
    out.push({
      rule: "reset", subject: "reset", verdict: "violation",
      detail: `No reset. "When the cut has no reset, it has no climax — regardless of how large the ending is." A peak is perceived against the level it rose from; a cut that never falls has no headroom left to peak into.`,
      cites: CITE.reset,
    });
  } else if (resets.length >= RESETS_TOO_MANY) {
    out.push({
      rule: "reset", subject: "reset", verdict: "violation",
      detail: `${resets.length} resets. "When there are three or more, remove all but one." Repetition converts the device from a reset into a rhythm — a stop used constantly resets nothing.`,
      cites: CITE.reset,
    });
  }

  // Position. Only decidable against ONE peak.
  if (peaks.length !== 1) {
    out.push({
      rule: "reset", subject: "position", verdict: "unmeasured",
      detail: `${peaks.length} beats are declared as the peak. The reset "sits immediately before whatever the cut's largest moment is", and with ${peaks.length === 0 ? "no peak" : "several peaks"} this checker cannot say which moment that is. Which peak is largest is a magnitude question — see the magnitude rule.`,
      cites: CITE.reset,
    });
  } else if (resets.length >= STRUCTURAL_RESETS) {
    const peakIdx = beats.indexOf(peaks[0]);
    const before = peakIdx > 0 ? beats[peakIdx - 1] : null;
    if (before && before.kind === "reset") {
      out.push({
        rule: "reset", subject: "position", verdict: "pass",
        detail: `The reset "${before.label}" sits immediately before the peak "${peaks[0].label}".`,
        ...where(before), cites: CITE.reset,
      });
    } else {
      out.push({
        rule: "reset", subject: "position", verdict: "violation",
        detail: `The beat before the peak "${peaks[0].label}" is ${before ? `"${before.label}" (${before.kind})` : "nothing — the peak opens the cut"}, not a reset. "an escalation that climbs monotonically into its climax arrives with nowhere to go."`,
        ...(before ? where(before) : {}), cites: CITE.reset,
      });
    }

    // A second reset is PERMITTED — "A punchline reset and a pre-peak reset can
    // coexist if the first is brief and clearly smaller." Brevity is duration and
    // duration is the shot layer's. So: reported, never graded.
    if (resets.length > STRUCTURAL_RESETS && resets.length < RESETS_TOO_MANY) {
      const extra = resets.find((r) => beats.indexOf(r) !== peakIdx - 1);
      out.push({
        rule: "reset", subject: extra ? extra.id : "second reset", verdict: "unmeasured",
        detail: `A second reset ("${extra?.label ?? "?"}"). This is permitted only "if the first is brief and clearly smaller" than the structural one. Brevity is a duration and this checker models no durations, so it cannot tell a punchline reset from a device that has stopped resetting anything.`,
        ...(extra ? where(extra) : {}), cites: CITE.reset,
      });
    }
  }

  // What the silence holds. "Fill the silence with one thing … A reset that holds
  // two ideas has spent its whole value carrying neither."
  for (const r of resets) {
    const holds = r.resetHolds ?? [];
    if (holds.length === 0) {
      out.push({
        rule: "reset", subject: r.id, verdict: "unmeasured",
        detail: `Reset "${r.label}" does not declare what the silence holds. A line, an image, or nothing at all — the choice is what the reset means, and undeclared is not the same as empty.`,
        ...where(r), cites: CITE.reset,
      });
    } else if (holds.length > HOLDS_PER_RESET) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" holds ${holds.length} things (${holds.join(", ")}). "Fill the silence with one thing … A reset that holds two ideas has spent its whole value carrying neither."`,
        ...where(r), cites: CITE.reset,
      });
    }
  }

  // Where it can land is the cue's decision, not the plan's.
  for (const r of resets) {
    const section = cut.cue?.sections.find((s) => s.id === r.cueMark);
    if (!cut.cue || !r.cueMark) {
      out.push({
        rule: "reset", subject: r.id, verdict: "unmeasured",
        // Three cases, three sentences: a reset that names a mark on a cut with no
        // cue DID name one, and the old single sentence told its author otherwise.
        detail: `Reset "${r.label}" ${r.cueMark ? `names cue mark "${r.cueMark}", but the cut declares no cue` : `names no cue mark${cut.cue ? "" : " and the cut declares no cue"}`}. "Stop on a natural downbeat … the cue's own section boundaries decide where the reset can go." Without the cue this checker is measuring against positions the music does not mark.`,
        ...where(r), cites: CITE.cue,
      });
    } else if (!section) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" names cue mark "${r.cueMark}", which is not a section of cue "${cut.cue.title}".`,
        ...where(r), cites: CITE.graph,
      });
    } else if (!section.isBoundary) {
      out.push({
        rule: "reset", subject: r.id, verdict: "violation",
        detail: `Reset "${r.label}" lands on "${section.label}", which is not a boundary. "A cue cut mid-phrase reads as a dropout. The stop belongs where the music would breathe anyway."`,
        ...where(r), cites: CITE.cue,
      });
    } else {
      out.push({
        rule: "reset", subject: r.id, verdict: "pass",
        detail: `Reset "${r.label}" lands on the cue boundary "${section.label}".`,
        ...where(r), cites: CITE.cue,
      });
    }
  }

  return out;
}
