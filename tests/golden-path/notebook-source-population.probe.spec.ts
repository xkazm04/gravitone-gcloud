// LANE — TWO UNRELATED "SOURCE" POPULATIONS, PINNED (static).
//
// notebook.ts keeps two independent hand-maintained lists that both answer to
// the word "source":
//
//   · NOTEBOOK.sources — the document-level bibliography, written as full
//     citation strings ("coindesk.com — bitcoin's U.S. reserve still a work
//     in progress (2026-07-06)"). Measured on this fixture: 11 entries.
//   · Fact.source across the 21 rows in facts.ts — short attributions
//     ("invezz, crypto.news, intellectia", "whitehouse.gov fact sheet").
//     Measured on this fixture: 20 DISTINCT strings.
//
// No code relates them. NOTEBOOK_COUNTS.sources used to be rendered bare as
// "sources · 11" in EvidenceLog.tsx and NotebookBody.tsx, on a page whose own
// header claims "every claim dated, sourced and rated" — so a reader had no
// way to know 11 was the bibliography, not a count of everything the 21 facts
// cite. The fix (this commit) renamed the label to "bibliography" wherever it
// is shown and added `NOTEBOOK_COUNTS.factSourceStrings` as an honestly-named
// sibling count, WITHOUT attempting to reconcile the two lists — a naive
// substring match misfires immediately (the bibliography writes
// "whitehouse.gov — fact sheet: Strategic Bitcoin Reserve (2025-03-06)" where
// the fact writes "whitehouse.gov fact sheet"), so filing a bad mapping would
// be worse than leaving the two lists honestly disjoint.
//
// This probe is the gate that keeps that honesty from rotting: it pins both
// counts as data, so a future edit that grows one population without
// touching the other — adding a fact with a new source string, or adding a
// bibliography entry — changes a number this test asserts on, rather than
// changing nothing anyone notices.
import { test, expect } from "@playwright/test";

import { NOTEBOOK, NOTEBOOK_COUNTS } from "@/app/_phases/_shared/notebook/notebook";

// Frozen baselines for the SHIPPED run-1 fixture, defended by the measurement
// in the finding this probe was written for: 11 vs 20. If either number ever
// changes, it is because the fixture changed, and the assertion failure names
// exactly which population moved and points at NOTEBOOK_COUNTS in notebook.ts
// as the place to update the comment (and, if genuinely intended, this file).
const EXPECTED_BIBLIOGRAPHY_COUNT = 11;
const EXPECTED_DISTINCT_FACT_SOURCE_COUNT = 20;

test("notebook-source-population: the bibliography and the fact-source set are pinned and DISTINCT", () => {
  // A "the walk read something" guard: an empty read of either population
  // would make every assertion below vacuously informative about nothing, so
  // fail loudly before comparing counts rather than let a broken fixture pass
  // by having nothing to disagree on.
  expect(NOTEBOOK.sources.length, "NOTEBOOK.sources is empty — the fixture did not load").toBeGreaterThan(0);
  expect(NOTEBOOK.facts.length, "NOTEBOOK.facts is empty — the fixture did not load").toBeGreaterThan(0);

  expect(
    NOTEBOOK_COUNTS.sources,
    `NOTEBOOK.sources (the document bibliography) moved from ${EXPECTED_BIBLIOGRAPHY_COUNT} to ` +
      `${NOTEBOOK_COUNTS.sources}. If this was an intentional edit to the bibliography, update ` +
      `EXPECTED_BIBLIOGRAPHY_COUNT here AND re-check the "sources · N" labels this count still feeds ` +
      "in EvidenceLog.tsx, NotebookBody.tsx and sections/Apparatus.tsx.",
  ).toBe(EXPECTED_BIBLIOGRAPHY_COUNT);

  expect(
    NOTEBOOK_COUNTS.factSourceStrings,
    `The distinct Fact.source strings in facts.ts moved from ${EXPECTED_DISTINCT_FACT_SOURCE_COUNT} to ` +
      `${NOTEBOOK_COUNTS.factSourceStrings}. If this was an intentional edit (a new fact citing a new ` +
      "source, or two facts consolidated onto one attribution), update EXPECTED_DISTINCT_FACT_SOURCE_COUNT here.",
  ).toBe(EXPECTED_DISTINCT_FACT_SOURCE_COUNT);

  // The structural fact the whole finding rests on: these are two different
  // numbers describing two different things. If a future change ever makes
  // them equal, that is a coincidence worth a human look, not proof they
  // became the same population — but this probe intentionally does NOT assert
  // inequality as a hard gate, because collapsing to equal counts by accident
  // is not itself a bug. What it DOES gate is silent, unnoticed drift in
  // either count, which is the actual defect this finding reported.
  console.log(
    `[source-population] bibliography=${NOTEBOOK_COUNTS.sources} ` +
      `distinctFactSources=${NOTEBOOK_COUNTS.factSourceStrings}`,
  );
});

test("notebook-source-population: factSourceStrings counts DISTINCT strings, not fact rows", () => {
  // Guards the exact bug a naive `NOTEBOOK.facts.length` substitute would
  // reintroduce: 21 facts cite 20 distinct source strings because one string
  // ("coinpedia regulation timeline") is reused by two facts. A count that
  // silently drifted to 21 would mean someone swapped `.size` for `.length`
  // on the array instead of the Set.
  const raw = NOTEBOOK.facts.map((f) => f.source);
  const distinct = new Set(raw);
  expect(NOTEBOOK_COUNTS.factSourceStrings).toBe(distinct.size);
  expect(NOTEBOOK_COUNTS.factSourceStrings, "distinct must be <= raw rows, or something double-counted").toBeLessThanOrEqual(
    raw.length,
  );
});
