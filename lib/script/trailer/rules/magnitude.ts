// Rule 7 · magnitude — `checkMagnitude` and its injected seam, `MagnitudeOf`.
// Size is not in the beat layer, so every rule here is `unmeasured` unless the
// caller supplies a resolver. Split out of `../structure.ts` (the door re-exports
// both names).

import type { TrailerBeat, TrailerCut } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { kindsOf, where } from "@/lib/script/trailer/readers";

/* ───────────────────── 7 · magnitude — the injected seam ──────────────────
   Two rules in the doctrine are about SIZE, and size is not in the beat layer:

     "The button … has one hard constraint: it must be smaller than the climax."
     "Verify the last rung is the largest, and that the peak after it exceeds the
      last rung by a margin a viewer would notice."

   The beat layer holds no duration, shot count or energy, and inventing a
   magnitude scale here would be exactly the thing this repo refuses to do. So the
   rules are executable ONLY when the caller injects a resolver — which is the
   shot layer's seam — and `unmeasured` otherwise. Note the second rule's margin
   ("a margin a viewer would notice") stays unmeasured even WITH a resolver,
   because the doctrine gives no threshold and this file does not invent one. */

export type MagnitudeOf = (beat: TrailerBeat) => number | null;

export function checkMagnitude(cut: TrailerCut, magnitudeOf?: MagnitudeOf): StructureFinding[] {
  const out: StructureFinding[] = [];
  const buttons = kindsOf(cut, "button");
  const peaks = kindsOf(cut, "peak");
  const rungs = kindsOf(cut, "rung");
  const peak = peaks.length === 1 ? peaks[0] : null;

  // A resolver's NaN or Infinity is not a size. Every comparison against NaN is
  // false, so before this guard a NaN button and peak read as `pass` ("smaller
  // than the climax") over a figure nobody measured.
  const mag = (b: TrailerBeat) => {
    const v = magnitudeOf ? magnitudeOf(b) : null;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const noResolver = magnitudeOf
    ? `The magnitude resolver gave no finite size for at least one of these beats, so there is nothing to compare.`
    : `No magnitude resolver was supplied. Magnitude lives in the shot layer (duration, shot count, energy); this file models beats and movements and refuses to invent a scale for them. Supply \`magnitudeOf\` — the shot lane's seam — to make this rule executable.`;

  if (buttons.length === 0) {
    out.push({
      rule: "magnitude", subject: "button", verdict: "not-engaged",
      detail: `No button. It is optional — "a last joke, sting or flourish after the title" — so there is nothing to size against the climax.`,
      cites: CITE.spine,
    });
  } else if (!peak) {
    out.push({
      rule: "magnitude", subject: "button", verdict: "unmeasured",
      detail: `A button is present but ${peaks.length === 0 ? "no peak is declared" : "several peaks are declared"}, so there is no single climax to be smaller than.`,
      cites: CITE.spine,
    });
  } else {
    for (const btn of buttons) {
      const a = mag(btn);
      const b = mag(peak);
      if (a === null || b === null) {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "unmeasured",
          detail: `Whether the button "${btn.label}" is smaller than the climax "${peak.label}" is not decidable from the beat layer. ${noResolver}`,
          ...where(btn), cites: CITE.spine,
        });
      } else if (a >= b) {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "violation",
          detail: `The button "${btn.label}" (${a}) is not smaller than the climax "${peak.label}" (${b}). "A button that outperforms the peak retroactively re-reads the peak as its setup" — and the last few seconds are what gets quoted.`,
          ...where(btn), cites: CITE.failures,
        });
      } else {
        out.push({
          rule: "magnitude", subject: btn.id, verdict: "pass",
          detail: `The button "${btn.label}" (${a}) is smaller than the climax "${peak.label}" (${b}).`,
          ...where(btn), cites: CITE.spine,
        });
      }
    }
  }

  if (rungs.length && peak) {
    const last = rungs[rungs.length - 1];
    const mags = rungs.map(mag);
    const lastMag = mags[mags.length - 1];
    const peakMag = mag(peak);

    if (mags.some((m) => m === null) || peakMag === null || lastMag === null) {
      out.push({
        rule: "magnitude", subject: "rise", verdict: "unmeasured",
        detail: `Whether the last rung is the largest, and whether the peak exceeds it, is not decidable from the beat layer. ${noResolver}`,
        cites: CITE.escalation,
      });
    } else {
      const biggest = Math.max(...(mags as number[]));
      if (lastMag < biggest) {
        out.push({
          rule: "magnitude", subject: last.id, verdict: "violation",
          detail: `The last rung "${last.label}" (${lastMag}) is not the largest (${biggest}). "Verify the last rung is the largest" — an escalation whose biggest step is not its last one falls before the peak.`,
          ...where(last), cites: CITE.escalation,
        });
      } else if (peakMag <= lastMag) {
        out.push({
          rule: "magnitude", subject: "rise", verdict: "violation",
          detail: `The peak "${peak.label}" (${peakMag}) does not exceed the last rung "${last.label}" (${lastMag}). "An escalation that arrives level with its own climax has no climax."`,
          ...where(peak), cites: CITE.escalation,
        });
      } else {
        out.push({
          rule: "magnitude", subject: "rise", verdict: "pass",
          detail: `Last rung is the largest rung (${lastMag}) and the peak exceeds it (${peakMag}).`,
          cites: CITE.escalation,
        });
      }
      out.push({
        rule: "magnitude", subject: "noticeable margin", verdict: "unmeasured",
        detail: `The peak must exceed the last rung "by a margin a viewer would notice". The doctrine states no threshold, and this file does not invent one — so the direction is checked above and the SIZE of the gap is not.`,
        cites: CITE.escalation,
      });
    }
  }

  return out;
}
