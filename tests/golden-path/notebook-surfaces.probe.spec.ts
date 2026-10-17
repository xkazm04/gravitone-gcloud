// LANE — THE NOTEBOOK SURFACES DRAW THE NOTEBOOK THEY ARE GIVEN (C1 closing stage,
// parts b and c; critic cases 4, 5 and 6).
//
// The evidence log, the notebook modal, its rail labels, the fact edges, the pills
// that open them and the Clear dialog all read the shipped run (`NOTEBOOK`,
// `NOTEBOOK_COUNTS`, `FACT_BY_ID`) at module load. So a creator's own reasoned
// notebook was announced with Bitcoin's counts, titled with Bitcoin's slug, and
// could not be opened at all when it was the only one the project had.
//
// RETIRED WITH THE v1 STUDIO (Phase 4 wave D): the evidence log, the notebook modal and its
// rail, the pills, the Clear dialog and the source chip were v1 components, deleted with
// app/_phases. Their successor draws the notebook of the part it is given (tests/live/
// part-editors.live.spec.ts "every face opens ... each drawing its own project's work"; a run
// over another topic never lands Bitcoin's, tests/next-server/producer-step-research.test.ts).
// What stays is the pure half: the counts and the edges resolve in the notebook handed over.
//
// This lane has no DOM, and Playwright's transform turns a component's JSX into
// test-runner descriptors, so a component cannot be rendered here. What is pinned
// is what each one is built from: the pure helpers (countsOf, sectionLabels,
// railFor) run for real on a reasoned notebook, and the components are read as
// source, the way the other lanes here read them.
import "fake-indexeddb/auto";

import { expect, test } from "@playwright/test";

import { countsOf } from "@/lib/notebook/counts";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "@/lib/notebook/notebook";
import { sourceOf } from "@/lib/notebook/source";

import { liveNotebook, RECEIPT } from "./_c1-harness";

/** A reasoned notebook whose second fact contests its first, so an edge has
 *  something to resolve against. */
function reasoned() {
  const nb = liveNotebook();
  nb.facts = nb.facts.map((f, i) => (i === 1 ? { ...f, contests: [nb.facts[0]!.id] } : f));
  return sourceOf(nb, { kind: "reasoned", receipt: RECEIPT });
}

/* ───────────────────── case 4: the evidence log and the modal ────────────────── */

test("case 4: the counts and edges of a reasoned notebook are its own", () => {
  const src = reasoned();
  const nb = src.notebook;
  const counts = countsOf(nb);
  expect(counts.facts).toBe(nb.facts.length);
  expect(counts.unknownsOpen).toBe(nb.unknowns.filter((u) => !u.resolvedBy).length);
  // The replay is unchanged.
  expect(countsOf(NOTEBOOK)).toEqual(NOTEBOOK_COUNTS);
  // A `contests` edge resolves against THIS notebook's index.
  expect(src.byId.facts[nb.facts[1]!.contests![0]!]).toBe(nb.facts[0]);
  expect(src.byId.facts["f-ath"]).toBeUndefined();
});

/* ─────────────────────────── case 5: pills and Clear ─────────────────────────── */

/* ───────────────────────────── case 6: the source chip ───────────────────────── */

test("case 6: a source's kind follows it: replay for the seed, reasoned plus the topic for a live notebook", () => {
  // The chip is a pure function of `source.kind` and `source.notebook.topic`, and
  // both surfaces hand it the source the gate reads (Script) or the hook deals
  // (Frames, frames-notebook.probe.spec.ts: `ctl.notebook.kind`).
  const own = reasoned();
  expect(own.kind).toBe("reasoned");
  expect(own.notebook.topic).toBe("harbour dredging costs");
  expect(sourceOf(NOTEBOOK, { kind: "replay" }).kind).toBe("replay");
});
