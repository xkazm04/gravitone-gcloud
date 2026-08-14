"use client";

// WHAT A VERSION WOULD NOT DO.
//
// Extracted from the candidate bar because it was only ever rendered there, and
// accepting a candidate clears that bar — so the record of what was declined,
// and why, vanished at the moment it became the baseline. A refusal is part of a
// version's history, not a notice that expires: the creator asked for something,
// the engine or a guard said no, and "no, because X" is the answer to a question
// they will otherwise ask again.
//
// Four kinds, deliberately distinct rather than merged into one "problems" list:
//   · modelRefusals — the ENGINE declined the note upstream, in its own words
//   · refusals      — a GUARD blocked it here (required material, scope)
//   · conflicts     — two notes on one track that could not both hold
//   · unsupported   — a turn left arguing from less, or from nothing
//
// Merging them would lose the thing that matters most to someone deciding what
// to do next: whether the request was refused, overruled, or merely survived.

import type { Version } from "../versions";

export default function DeclinedList({ version }: { version: Version }) {
  const { modelRefusals = [], refusals, conflicts, unsupported } = version;
  const total = modelRefusals.length + refusals.length + conflicts.length + unsupported.length;
  if (total === 0) return null;

  return (
    <>
      {modelRefusals.map((r, i) => (
        <p
          key={`m-${i}`}
          data-testid="model-refusal"
          className="font-jetbrains mt-1.5 text-[11px] leading-snug text-amber-200"
        >
          not done · {r.note ? <span className="text-white/55">{r.note} — </span> : null}
          {r.why}
        </p>
      ))}

      {/* A guard that fires silently is the bug it was meant to fix. */}
      {refusals.map((f, i) => (
        <p
          key={`r-${f.cardId}-${f.kind}-${i}`}
          data-testid="refusal"
          className="font-jetbrains mt-1.5 text-[11px] leading-snug text-rose-200"
        >
          refused · {f.cardId} — {f.why}
        </p>
      ))}

      {conflicts.map((c) => (
        <p
          key={`c-${c.cardId}`}
          data-testid="conflict"
          className="font-jetbrains mt-1.5 text-[11px] leading-snug text-amber-200"
        >
          conflict · {c.cardId} — applied {c.applied}; {c.why}
        </p>
      ))}

      {unsupported.map((u) => (
        <p
          key={`u-${u.cardId}`}
          data-testid="unsupported"
          className={`font-jetbrains mt-1.5 text-[11px] leading-snug ${
            u.severity === "broken" ? "text-rose-200" : "text-amber-200"
          }`}
        >
          {u.cardId} {u.severity === "broken" ? "argues from nothing" : "argues from less"} — lost{" "}
          {u.lost.join(", ")}
        </p>
      ))}
    </>
  );
}

/** How many things a version declined — for a heading that has to earn its space. */
export function declinedCount(v: Version): number {
  return (v.modelRefusals?.length ?? 0) + v.refusals.length + v.conflicts.length + v.unsupported.length;
}
