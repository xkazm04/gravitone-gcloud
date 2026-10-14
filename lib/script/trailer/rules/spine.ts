// Rule 3 · the spine — `checkSpine`. Diagnostic, never a gate: the findings are
// real for a specialty-lane cut too; what changes is that `malformed` refuses to
// render a verdict over them. Split out of `../structure.ts` (the door re-exports it).

import { SPINE_ORDER, type TrailerBeat, type TrailerCut } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { chain, kindsOf, movementById, requiredRoles, where } from "@/lib/script/trailer/readers";
import { LEGAL_KINDS } from "@/lib/script/trailer/thresholds";

/* ────────────────────────── 3 · the spine ─────────────────────────────────
   Diagnostic, never a gate — see the header. The findings are real for a
   specialty-lane cut too; what changes is that `malformed` refuses to render a
   verdict over them. */

export function checkSpine(cut: TrailerCut): StructureFinding[] {
  const out: StructureFinding[] = [];
  const byId = movementById(cut);
  const present = new Set(cut.movements.map((m) => m.role));

  for (const role of requiredRoles(cut)) {
    if (!present.has(role)) {
      out.push({
        rule: "spine", subject: role, verdict: "violation",
        detail:
          role === "introduction"
            ? `No introduction movement. It is "the part that gets cut first at shorter lengths, and the part whose absence turns the escalation into noise" — and it is the move that personalising cost depends on. If it was dropped for this rung, declare it in droppedParts.`
            : `No ${role} movement. The spine is cold open → introduction → escalation → climax → (button), and ${role} is not one of the optional parts.`,
        cites: CITE.spine,
      });
    }
  }

  // Order. Repeats are allowed (two escalation movements is a shape, not a
  // defect); going backwards is not.
  const ordered = [...cut.movements].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 1; i < ordered.length; i++) {
    const prevIdx = SPINE_ORDER.indexOf(ordered[i - 1].role);
    const thisIdx = SPINE_ORDER.indexOf(ordered[i].role);
    if (thisIdx < prevIdx) {
      out.push({
        rule: "spine", subject: ordered[i].id, verdict: "violation",
        detail: `"${ordered[i].label}" (${ordered[i].role}) sits after "${ordered[i - 1].label}" (${ordered[i - 1].role}). The spine runs ${SPINE_ORDER.join(" → ")}; this pair runs backwards.`,
        cites: CITE.spine,
      });
    }
  }

  // Beats must run in movement order. A peak beat sitting before the escalation
  // is the front-loading failure — "The peak lands before the viewer has stakes,
  // and everything after is downhill."
  const ordinalOf = (b: TrailerBeat) => byId.get(b.movement)?.ordinal ?? null;
  const beats = chain(cut);
  for (let i = 1; i < beats.length; i++) {
    const a = ordinalOf(beats[i - 1]);
    const b = ordinalOf(beats[i]);
    if (a === null || b === null) continue; // already a graph violation
    if (b < a) {
      out.push({
        rule: "spine", subject: beats[i].id, verdict: "violation",
        detail: `Beat "${beats[i].label}" belongs to an earlier movement than the beat before it. The chain order and the movement order disagree, so the acts interleave.`,
        ...where(beats[i]), cites: CITE.failures,
      });
      break; // one report; the rest are consequences of the same inversion
    }
  }

  // Kind legality per role.
  let illegal = 0;
  for (const b of beats) {
    const m = byId.get(b.movement);
    if (!m) continue;
    if (!LEGAL_KINDS[m.role].includes(b.kind)) {
      illegal++;
      out.push({
        rule: "spine", subject: b.id, verdict: "violation",
        detail: `A "${b.kind}" beat sits in a ${m.role} movement, which carries ${LEGAL_KINDS[m.role].join(" / ")}. ${b.kind === "peak" ? "A peak outside the climax is the front-loading failure: the cut has spent its ceiling early." : "The part and the beat disagree about what this moment is."}`,
        ...where(b), cites: CITE.spine,
      });
    }
  }

  const peaks = kindsOf(cut, "peak");
  if (peaks.length === 0 && !cut.moodLed) {
    out.push({
      rule: "spine", subject: "peak", verdict: "violation",
      detail: `No peak beat. The climax is the part the whole shape builds to; a cut with no declared peak has nothing for the reset to precede and nothing for the button to be smaller than. If this is a sustained-gradient piece, set moodLed.`,
      cites: CITE.spine,
    });
  }

  if (!out.length && beats.length) {
    out.push({
      rule: "spine", subject: "shape", verdict: "pass",
      detail: `Roles ${ordered.map((m) => m.role).join(" → ")}: every required part present, order forward, ${beats.length - illegal} beats legal for their movement.`,
      cites: CITE.spine,
    });
  }
  return out;
}
