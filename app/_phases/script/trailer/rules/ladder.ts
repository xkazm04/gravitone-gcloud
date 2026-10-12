// Rule 10 · the length ladder — `checkLadder`. The drop order is data
// (`DROP_ORDER`), so this is a real check. Split out of `../structure.ts` (the door
// re-exports it).

import { DROP_ORDER, type TrailerCut } from "../types";
import { CITE, type StructureFinding } from "../structureTypes";

/* ─────────────────────────── 10 · the length ladder ───────────────────────
   "Halving a cut does not halve its parts. It removes parts, in a known order."
   The drop order is data (`DROP_ORDER`), so this is a real check. The part COUNTS
   per rung are not encoded — see the unmeasured row at the bottom. */

export function checkLadder(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const drops = cut.droppedParts ?? [];

  // A cut with nothing in it engages no ladder rule. The drop order removes
  // PARTS, and a cut that declares none has no parts for it to have removed —
  // so "nothing was dropped" is not a fact about this cut's shape, it is the
  // absence of a cut. Without this guard the long-cut branch below was the last
  // place in the file that could still say `pass` about something it never read:
  // an empty cut, and a one-beat cut missing its escalation, climax, peak, reset
  // and title, both scored `pass — the full spine`.
  if (!cut.beats.length && !cut.movements.length) {
    out.push({
      rule: "ladder", subject: "rung", verdict: "not-engaged",
      detail: `The cut declares no movements and no beats, so the drop order has no parts to have removed. This check examined nothing and does not count as enforcement.`,
      cites: CITE.ladder,
    });
    return out;
  }

  if (cut.rung === "long-cut") {
    out.push(
      drops.length
        ? {
            rule: "ladder", subject: "rung", verdict: "violation",
            detail: `Declared a long-cut but drops ${drops.join(", ")}. "The long cut — four parts and an optional button. The full spine." A long cut with parts removed is a shorter rung wearing the long cut's name.`,
            cites: CITE.ladder,
          }
        : {
            // What the ladder can see is the DECLARATION. Whether the spine is
            // actually complete is `checkSpine`'s answer, and claiming it here
            // asserted a second, unchecked verdict over the same cut — one that
            // contradicted the spine rows sitting directly above it.
            rule: "ladder", subject: "rung", verdict: "pass",
            detail: `A long cut, and no part is declared dropped — "The long cut — four parts and an optional button." This is a verdict on the DECLARATION only; whether every part is really present is the spine rule's answer, above.`,
            cites: CITE.ladder,
          },
    );
    return out;
  }

  if (!drops.length) {
    out.push({
      rule: "ladder", subject: "drops", verdict: "unmeasured",
      detail: `Declared rung "${cut.rung}" but no dropped parts. A shorter rung is derived by DELETING whole parts down the drop order, never by trimming all of them; with nothing declared, whether this cut was derived or trimmed cannot be read.`,
      cites: CITE.ladder,
    });
  } else {
    let ordered = true;
    for (const part of drops) {
      const idx = DROP_ORDER.indexOf(part);
      const skipped = DROP_ORDER.slice(0, idx).filter((p) => !drops.includes(p));
      if (skipped.length) {
        ordered = false;
        out.push({
          rule: "ladder", subject: part, verdict: "violation",
          detail: `Drops "${part}" while keeping ${skipped.join(", ")}, which the order puts ahead of it. The order is the technique's actual content: ${DROP_ORDER.join(" → ")}. Keeping the largest saving and cutting a later one is how a short cut ends up with a setup too short to establish anything.`,
          cites: CITE.ladder,
        });
      }
    }
    if (ordered) {
      out.push({
        rule: "ladder", subject: "drops", verdict: "pass",
        detail: `Drops ${drops.join(", ")} — a prefix of the drop order ${DROP_ORDER.join(" → ")}.`,
        cites: CITE.ladder,
      });
    }
  }

  out.push({
    rule: "ladder", subject: "part count", verdict: "unmeasured",
    detail: `Part counts per rung ("Two for a teaser, three for a spot") are stated by the technique in a part vocabulary that does not map onto the spine's movement roles without inventing the mapping — a teaser is "a context section, and one set-piece"; a spot is "a state, a consequence, a payoff". Not checked, and deliberately not approximated. Runtimes are likewise absent: every figure the doctrine gives for them is hedged.`,
    cites: CITE.ladder,
  });

  return out;
}
