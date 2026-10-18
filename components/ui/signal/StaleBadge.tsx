"use client";

// "THIS NUMBER WAS MEASURED AGAINST SOMETHING ELSE."
//
// The same two-sentence disclaimer, six times across three columns:
//
//   app/_phases/script/_parts/HypothesisColumn.tsx:102-107
//        "words are counted from this version's own chain. Turns, questions
//         aloud and the promise form are the original render's and were not
//         re-measured."
//   app/_phases/script/_parts/HypothesisColumn.tsx:127-135
//        "typed by hand against the original chain and not re-run for this
//         version. Of the three check blocks in this column, only the gate below
//         reads the script on screen."
//   app/_phases/script/_parts/ConstraintLedger.tsx:44-49
//        "hand-written about the original chain. It has no probe, so it cannot
//         follow a rewrite — read the computed gate below instead."
//   app/_phases/script/_parts/HypothesisColumn.tsx:112-117
//        "causal-opener density — not measured on this render. Shown as
//         unmeasured rather than as a pass."
//
// Every one of them is the same fact — this figure is STALE — plus one reason.
// The fact becomes a badge you can see beside the number it qualifies; the
// reason goes behind the badge's own <Hint>, in ONE sentence, and the rest of
// each paragraph is the app explaining its own measurement pipeline and goes.
//
// Amber, never rose: app/_phases/_shared/ui/Notice.tsx makes this argument and
// it holds here. An unmeasured figure is a limit you should know about, not a
// thing that broke — and a warning that looks like an error teaches people to
// ignore both.

import { History, Hourglass } from "lucide-react";

// The chip spelling and amber tone were v1 Tally's; Tally and Hint moved to @gt/ui and the
// only caller (app/_landing/parts.tsx) passes neither a tone nor a reason, so they live here.
const CHIP_AMBER =
  "font-jetbrains inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-label tracking-[0.12em] whitespace-nowrap border-amber-400/30 bg-amber-400/[0.08] text-amber-200/90";

export function StaleBadge({
  words = "not re-run",
  glyph = "hourglass",
  className = "",
}: {
  /** One or two words — "not re-run", "unmeasured", "hand-written". */
  words?: string;
  /** `hourglass` = waiting on a measurement; `history` = measured, but before. */
  glyph?: "hourglass" | "history";
  className?: string;
}) {
  const Glyph = glyph === "history" ? History : Hourglass;
  return (
    <span className={`${CHIP_AMBER} ${className}`}>
      <Glyph className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {words}
    </span>
  );
}
