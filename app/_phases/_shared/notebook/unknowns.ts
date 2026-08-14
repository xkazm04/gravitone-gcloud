// What the research could not settle — and what each limit forbids the script
// from saying.
//
// Resolved unknowns are KEPT, flagged, and never deleted. Deleting one is what
// shifted every index in the Script step's constraint ledger and crashed it;
// keeping it also preserves the fact that a render written under the old
// constraint is now more cautious than the evidence requires.
//
// `impact` is a PROHIBITION and stays one — it is the field the script step
// actually scores against, and its force is a guardrail. What it never was is a
// container for the two things that kept being filed under it: required ranges
// (see `Obligation` in types.ts, and the note at the bottom of this file) and
// established absences (see `facts[].kind: "absence"`). Both were being
// expressed as a rule about what may not be said, which inverts the polarity of
// material that is a finding in its own right.
//
// A resolved unknown is still ENFORCED by gate.ts, and that is deliberate — the
// gate cannot know when a render was written, so supersession is recorded per
// render in script/constraints.ts instead. The rule, and the one case where it
// is currently wrong (`u-cohorts`), are written out on `Unknown.resolvedBy`.

import type { Unknown } from "./types";

/** `about` — WHICH figure the constraint binds. The deny-list was global: "never
 *  a precise figure" is written about the spot price and reads, to the script
 *  step, as a rule about every number in the notebook. A constraint that cannot
 *  say what it is about is enforced either too widely or not at all.
 *
 *  Intersected rather than declared so this file compiles whether or not the
 *  contract has landed the field yet (E8 is Editor A's; Rule 0 is additive). */
type UnknownRow = Unknown & { about?: string[] };

export const UNKNOWNS: UnknownRow[] = [

    {
      id: "u-cohorts",
      what: "Whether the accumulation and the distribution are the same people",
      why: "Long-term holders were reported both distributing 3.67m BTC and adding ~380,000 BTC in the same year",
      impact: "Use both readings, make neither decisive. The script may not name a single seller.",
      resolvedBy:
        "follow-up round 1 — wallets >1,000 BTC absorbed ~270k BTC while holders of 100–1,000 BTC distributed ~77,800 BTC over the same window. Different cohorts. The script MAY now name the seller.",
    },
    {
      id: "u-spot-price",
      what: "The precise spot price on the day of writing",
      why: "Sources in the same week quote $60k, $62k and $65k",
      impact: "Say 'around $60,000' or 'roughly half its high'. Never a precise figure.",
    },
    {
      id: "u-liquidity-vendor",
      what: "Whether the vendor liquidity-beta figures could be relied on",
      why: "Single vendor, methodology unreviewed, and the numbers were the most quotable in the notebook",
      impact: "The 93% / 7.6x figures may not be stated in any render.",
      resolvedBy:
        "follow-up round 1 — f-liquidity was killed outright and replaced by f-m2-divergence, which argues the same thesis from a second source. The constraint no longer binds because the fact is gone.",
    },
    {
      id: "u-yield-causality",
      what: "Causality between yields and bitcoin",
      why: "Correlation is measured; causation is asserted by analysts",
      impact: "Phrase as 'moves with', not 'because of'.",
    },
];

/* --------------------------------------------------------------- obligations

   THE OTHER HALF LIVES IN types.ts, and the empty `OBLIGATIONS` array that sat
   here is gone.

   It was a second declaration of the `Obligation` noun, permanently `[]`, with
   no reader — thirty lines of design that read, to anyone grepping the types,
   as a working half of the honesty layer. What the array said is true and is
   said where it belongs: `unknowns[].impact` is a deny-list and stays one; what
   the script MUST say is `Obligation` (types.ts); an established absence is
   neither, and goes in `facts[].kind: "absence"` with its search scope.

   Run 1 wrote no obligations and this file will not invent them — a control
   that quietly grew new material is not a control. When a run writes some, they
   go in `Notebook.obligations`, beside `unknowns`, not in a module const. */
