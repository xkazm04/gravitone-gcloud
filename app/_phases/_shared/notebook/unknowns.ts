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
// (see OBLIGATIONS, below) and established absences (see `facts[].kind:
// "absence"`). Both were being expressed as a rule about what may not be said,
// which inverts the polarity of material that is a finding in its own right.

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

   THE OTHER HALF. `unknowns[].impact` is a deny-list, and it is the best field
   in the schema for exactly that job — it is not softened here, and nothing in
   this block may weaken it (Guardrail 5). What it cannot hold is the opposite
   polarity: what the script MUST say.

   A deny-list alone produces an evasive video. "The precise spot price is
   contested" forbids a figure and requires nothing, so the honest render —
   *state the range $60k–$65k, name the term that is unsettled, attribute the
   width to it* — was a must-say with no home, and a render that simply omitted
   the number scored clean. An omission cannot be caught by a prohibition.

   Established absences do NOT live here either, in either field: a record shown
   NOT to exist is a `facts[]` entry with `kind: "absence"` and its search scope.
   Phase 7's framing — *what the research could not settle* — is the wrong
   polarity for *what the world has been shown not to contain*, and filing the
   second under the first is how "we asked, they did not reply" rendered as the
   researcher's omission rather than the subject's refusal.

   Typed structurally on purpose: `Obligation` is landing in the notebook
   contract (types.ts, E8) and this file must not race it with a second
   declaration of the same noun. Empty for now — the control fixture's
   obligations are the migration's to write, and a control that quietly grew new
   material is not a control (Rule 1). */
export const OBLIGATIONS: {
  id: string;
  /** What the script must say. Stated as a positive requirement, checkable. */
  must: string;
  why: string;
  /** Which figures or cards it binds — per-figure, like `Unknown.about`. */
  about?: string[];
}[] = [];
