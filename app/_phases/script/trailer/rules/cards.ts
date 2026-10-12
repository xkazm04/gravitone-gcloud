// Rule 8 · card ordering — `checkCards`. Title cards, the button's position after a
// title, and the brand-mark position. Split out of `../structure.ts` (the door
// re-exports it).

import type { TrailerCut } from "../types";
import { CITE, type StructureFinding } from "../structureTypes";
import { chain, kindsOf, where } from "../readers";

/* ────────────────────────── 8 · card ordering ─────────────────────────────
   The registry lists these among the properties that are "mechanically
   checkable": "Card ordering (does a title precede the button) … the position of
   a brand mark in the first seconds". */

export function checkCards(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const beats = chain(cut);
  const titles = kindsOf(cut, "title");
  const buttons = kindsOf(cut, "button");

  if (titles.length === 0) {
    out.push({
      rule: "cards", subject: "title", verdict: "violation",
      detail: `No title card. The ladder names the title and the call-to-action as the LAST things to go — "The first two are contractual and are the only thing the cut is actually buying."`,
      cites: CITE.ladder,
    });
  }

  for (const btn of buttons) {
    const btnIdx = beats.indexOf(btn);
    const titleBefore = titles.some((t) => beats.indexOf(t) < btnIdx);
    out.push(
      titleBefore
        ? {
            rule: "cards", subject: btn.id, verdict: "pass",
            detail: `The button "${btn.label}" follows a title card, which is what makes it a button rather than a final beat of the climax.`,
            ...where(btn), cites: CITE.spine,
          }
        : {
            rule: "cards", subject: btn.id, verdict: "violation",
            detail: `The button "${btn.label}" is not preceded by any title card. The button is "a last joke, sting or flourish AFTER the title"; before it, it is just the end of the cut.`,
            ...where(btn), cites: CITE.spine,
          },
    );
  }

  // The brand mark. The registry says the position is checkable and that the
  // JUDGEMENT is not: "Where the mark carries real pedigree this is a deliberate
  // asset; where it does not, it belongs at the end." So report the position and
  // refuse the verdict.
  const first = beats[0];
  if (first && first.kind === "title") {
    out.push({
      rule: "cards", subject: first.id, verdict: "unmeasured",
      detail: `The cut opens on a card ("${first.label}"). "Opening on an unearned mark" spends the most valuable seconds of the form; where the mark carries real pedigree the same choice is a deliberate asset. This checker cannot know which, so it reports the position and leaves the verdict to a human.`,
      ...where(first), cites: CITE.failures,
    });
  } else if (first) {
    out.push({
      rule: "cards", subject: "opening", verdict: "pass",
      detail: `The cut opens on "${first.label}" (${first.kind}), not on a card.`,
      ...where(first), cites: CITE.failures,
    });
  }

  return out;
}
