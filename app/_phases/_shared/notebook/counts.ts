// THE COUNTS OF A NOTEBOOK — pure, over whichever notebook is being drawn.
//
// `NOTEBOOK_COUNTS` (notebook.ts) is `countsOf(NOTEBOOK)`: the shipped run's
// numbers, fixed at module load. The evidence log, the notebook modal, the rail
// labels and the Clear dialog drew those for every project, so a creator's own
// notebook was announced with Bitcoin's 21 facts. They take `countsOf(nb)` of the
// notebook they draw instead. A new module because `source.ts` imports
// `notebook.ts`, which would otherwise import it back.

import type { Notebook } from "./types";

export function countsOf(nb: Notebook) {
  return {
    facts: nb.facts.length,
    loadBearing: nb.facts.filter((f) => f.loadBearing).length,
    lowConfidence: nb.facts.filter((f) => f.confidence === "low").length,
    /** The flag that matters most: load-bearing AND low confidence. */
    flagged: nb.facts.filter((f) => f.loadBearing && f.confidence === "low").length,
    mechanisms: nb.mechanisms.length,
    reversals: nb.reversals.length,
    // `sources` and `factSourceStrings` count TWO UNRELATED POPULATIONS, and the
    // names are deliberately not interchangeable so a caller cannot reach for
    // the wrong one by habit:
    //
    //   · `sources` is nb.sources — the document-level bibliography,
    //     hand-written as full citation strings ("coindesk.com — bitcoin's U.S.
    //     reserve still a work in progress (2026-07-06)"). Measured on this
    //     fixture: 11 entries.
    //   · `factSourceStrings` is the DISTINCT set of `Fact.source` values across
    //     the 21 rows in facts.ts, hand-written as short attributions
    //     ("invezz, crypto.news, intellectia", "whitehouse.gov fact sheet").
    //     Measured on this fixture: 20 distinct strings.
    //
    // Nothing links them — no code asserts a fact's `source` appears anywhere in
    // nb.sources, and a naive substring match would misfire immediately:
    // the bibliography writes "whitehouse.gov — fact sheet: Strategic Bitcoin
    // Reserve (2025-03-06)" where the fact writes "whitehouse.gov fact sheet".
    // They were authored by different people at different times for different
    // readers (a bibliography vs. an attribution beside a claim), and forcing a
    // reconciliation here would either hide real gaps behind a bad matcher or
    // invent one that does not exist. So both counts are surfaced honestly,
    // named for the population each one actually counts, and
    // notebook-source-population.probe.spec.ts pins both numbers so a future
    // edit that grows one list without the other is caught rather than silent.
    sources: nb.sources.length,
    factSourceStrings: new Set(nb.facts.map((f) => f.source)).size,
    unknowns: nb.unknowns.length,
    /** The count that actually constrains a script being written today. */
    unknownsOpen: nb.unknowns.filter((u) => !u.resolvedBy).length,
    gaps: nb.researchGaps.length,
  };
}

export type NotebookCounts = ReturnType<typeof countsOf>;
