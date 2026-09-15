"use client";

// DISCRETE STATE, DRAWN. A row of pips, one per slot, because the thing being
// described is already countable and already small.
//
//   app/library/parts.tsx:265-268   "{PROOF_CAP} approved proofs — the model's
//                                   whole reference-image window. Reject one to
//                                   make room; it stays on the sheet as the
//                                   record of what this style is not." Two
//                                   sentences to say a window is full. Five
//                                   pips, all filled, say it on sight — and
//                                   `max` is exactly the capacity read that
//                                   paragraph is reaching for.
//   app/_phases/research/beats/BeatVariantBoard.tsx:70-76
//                                   a spine-status sentence that is one pip per
//                                   slot: which beats have a variant, which are
//                                   still empty.
//   app/playground/PlaygroundView.tsx:544-546
//                                   "an edit that touches nothing is a copy" —
//                                   four section pips say which sections were
//                                   touched, and the sentence goes.
//
// EVERY PIP IS `aria-hidden` AND THE ROW CARRIES ONE LABEL. Twelve pips
// announced individually is twelve announcements of nothing; the row is one
// image with one name. The caller supplies that name when it knows the verb
// ("3 of 5 picked"); when it does not, one is generated from the states, which
// is honest but toneless — prefer to supply it.

export type PipState = "filled" | "hollow" | "amber" | "rose";

const PIP: Record<PipState, string> = {
  filled: "bg-cyan-300/90",
  hollow: "border border-white/25",
  amber: "bg-amber-300/90",
  rose: "bg-rose-400/90",
};

/** The pips past `states.length` — capacity that exists but is not spoken for.
 *  Fainter than `hollow`, which means "a slot that is waiting"; this means "a
 *  slot that is merely allowed". */
const CAPACITY = "border border-white/[0.10]";

/** Neutral, verbless, and only used when the caller supplies nothing. */
function describe(states: PipState[], total: number): string {
  const n = (s: PipState) => states.filter((x) => x === s).length;
  const parts = [`${n("filled")} of ${total} done`];
  if (n("amber")) parts.push(`${n("amber")} needs a call`);
  if (n("rose")) parts.push(`${n("rose")} broken`);
  return parts.join(", ");
}

/**
 * `<PipRow states={["filled", "hollow", "amber", "filled"]} />`
 *
 * With `max`, the row draws the whole capacity and fills the front of it —
 * `states={approved} max={PROOF_CAP}` is the reference-image window.
 */
export function PipRow({
  states,
  max,
  label,
  className = "",
}: {
  states: PipState[];
  /** Capacity. Slots beyond `states.length` are drawn as unclaimed. */
  max?: number;
  /** What the row means, in the caller's own verb — "3 of 5 picked". */
  label?: string;
  className?: string;
}) {
  const total = Math.max(states.length, max ?? 0);
  const spare = Math.max(0, total - states.length);
  return (
    <span
      role="img"
      aria-label={label ?? describe(states, total)}
      className={`inline-flex items-center gap-1 align-middle ${className}`}
    >
      {states.map((s, i) => (
        <span key={`s${i}`} aria-hidden className={`h-2 w-2 rounded-full ${PIP[s]}`} />
      ))}
      {Array.from({ length: spare }, (_, i) => (
        <span key={`c${i}`} aria-hidden className={`h-2 w-2 rounded-full ${CAPACITY}`} />
      ))}
    </span>
  );
}
