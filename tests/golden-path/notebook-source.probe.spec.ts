// LANE — THE BOARD DEALS A SOURCE, NOT A CONSTANT (research-scope-board-A, stage 1).
//
// Before this lane, the scope board and its arithmetic read one notebook through
// module constants: `buildCards()` appended the fixture's CONCLUSIONS to whatever
// notebook it was handed, tagged cards from the fixture's CARD_DIMENSION, and
// `research/scope.ts` built OPT_IN_IDS from CONCLUSIONS at module load. A
// creator's own notebook could not be dealt without dragging Bitcoin's seven
// conclusions in behind it.
//
// Stage 1 makes "the notebook the board deals" one object — a NotebookSource —
// and threads it through buildCards / scopeSummary / optInIds / useScope. It is a
// PURE REFACTOR on the fixture, so the first test pins today's board as data
// written out here rather than as a call to the code under test: a pin computed
// the way the implementation computes it agrees with the implementation by
// definition (the same argument scope-decisions.probe.spec.ts makes).
//
// Later stages (schema fields, the live notebook, Step 2's readers) extend this
// file; nothing here touches the live path.

import { test, expect } from "@playwright/test";

import { buildCards, untaggedIds } from "@/app/_phases/_shared/notebook/cards";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { DIMENSIONS, UNTAGGED_DIMENSION_ID, type Dimension } from "@/app/_phases/_shared/notebook/dimensions";
import { FACT_BY_ID, NOTEBOOK, UNKNOWN_BY_ID } from "@/app/_phases/_shared/notebook/notebook";
import { fixtureSource, sourceOf } from "@/app/_phases/_shared/notebook/source";
import { OPT_IN_IDS, optInIds, scopeSummary, stateOf } from "@/app/_phases/research/scope";

/** Today's board, 2026-10-05: [id, kind, dimension, dependsOn, optIn, required].
 *  Written out, not derived. The card that proposed this stage said 39 cards;
 *  the tree measured 36 on the day it was built. */
const TODAY: [string, string, string, string, 0 | 1, 0 | 1][] = [
  ["f-ath", "fact", "the-number", "", 0, 0],
  ["f-nov-crash", "fact", "the-number", "", 0, 0],
  ["f-now", "fact", "the-number", "", 0, 0],
  ["f-drawdown", "fact", "the-number", "", 0, 0],
  ["f-sbr", "fact", "politics", "", 0, 0],
  ["f-sbr-unbuilt", "fact", "politics", "", 0, 0],
  ["f-genius", "fact", "politics", "", 0, 0],
  ["f-lth-distribution", "fact", "flows", "", 0, 0],
  ["f-etf-lag", "fact", "flows", "", 0, 0],
  ["f-etf-absorbed", "fact", "flows", "", 0, 0],
  ["f-mnav", "fact", "actors", "", 0, 0],
  ["f-mstr-drop", "fact", "actors", "", 0, 0],
  ["f-mstr-sold", "fact", "actors", "", 0, 0],
  ["f-mstr-defence", "fact", "counter-case", "", 0, 0],
  ["f-correlation", "fact", "macro", "", 0, 0],
  ["f-yields", "fact", "macro", "", 0, 0],
  ["f-macro-cause", "fact", "macro", "", 0, 0],
  ["f-supply-2pct", "fact", "counter-case", "", 0, 0],
  ["f-m2-divergence", "fact", "macro", "", 0, 0],
  ["f-whale-absorb", "fact", "flows", "", 0, 0],
  ["f-midtier-distribute", "fact", "flows", "", 0, 0],
  ["m-etf-plumbing", "mechanism", "flows", "", 0, 0],
  ["m-treasury-flywheel", "mechanism", "actors", "", 0, 0],
  ["m-institutionalisation", "mechanism", "macro", "", 0, 0],
  ["r1", "reversal", "flows", "f-etf-lag f-etf-absorbed f-lth-distribution m-etf-plumbing", 0, 0],
  ["r2", "reversal", "actors", "f-mnav f-mstr-drop f-mstr-sold m-treasury-flywheel", 0, 0],
  ["r3", "reversal", "politics", "f-sbr f-sbr-unbuilt f-genius f-macro-cause", 0, 0],
  ["r4", "reversal", "macro", "f-correlation f-m2-divergence f-yields m-institutionalisation", 0, 0],
  ["c-one-time-rerating", "conclusion", "conclusions", "f-etf-absorbed f-mnav f-sbr f-genius", 1, 0],
  ["c-correlation-is-the-product", "conclusion", "conclusions", "f-correlation f-m2-divergence f-yields m-institutionalisation", 1, 0],
  ["c-closed-end-fund", "conclusion", "conclusions", "f-mnav f-mstr-drop f-mstr-sold m-treasury-flywheel", 1, 0],
  ["c-permission-not-appetite", "conclusion", "conclusions", "f-sbr f-sbr-unbuilt f-genius f-macro-cause", 1, 0],
  ["c-scarcity-not-a-floor", "conclusion", "conclusions", "f-whale-absorb f-midtier-distribute f-lth-distribution", 1, 0],
  ["c-borrowed-prosperity", "conclusion", "conclusions", "f-lth-distribution f-midtier-distribute f-whale-absorb f-correlation", 1, 0],
  ["c-reserve-was-the-product", "conclusion", "conclusions", "f-sbr f-sbr-unbuilt f-genius", 1, 0],
  ["steel-man", "steel-man", "counter-case", "f-mstr-defence f-supply-2pct", 0, 1],
];

// ─────────────────────────────────────────── case 1: the fixture is unchanged

test("buildCards(fixtureSource()) is today's board, card for card", () => {
  const cards = buildCards(fixtureSource());
  expect(cards.length, "the walk dealt nothing - this test proves nothing").toBeGreaterThan(20);

  const shape = cards.map((c) => [c.id, c.kind, c.dimension, c.dependsOn.join(" "), c.optIn ? 1 : 0, c.required ? 1 : 0]);
  expect(shape, "the fixture source must deal exactly the board the constants dealt").toEqual(TODAY);
});

test("every older spelling of the fixture deals the same cards as the source", () => {
  const viaSource = buildCards(fixtureSource());
  // No argument (useScope, five probes) and the notebook itself (validate.ts,
  // two probes) are both still in use and must mean the fixture exactly.
  expect(buildCards()).toEqual(viaSource);
  expect(buildCards(NOTEBOOK)).toEqual(viaSource);
  expect(untaggedIds(fixtureSource())).toEqual(untaggedIds(NOTEBOOK));
});

test("the fixture source is one object, and its indexes are the module constants", () => {
  const src = fixtureSource();
  expect(fixtureSource(), "a fresh source per call would re-deal the board on every render").toBe(src);
  expect(src.kind).toBe("replay");
  expect(src.notebook).toBe(NOTEBOOK);
  expect(src.conclusions.map((c) => c.id)).toEqual(CONCLUSIONS.map((c) => c.id));
  expect(src.dimensions.map((d) => d.id)).toEqual(DIMENSIONS.map((d) => d.id));
  expect(src.digest, "a source without an identity cannot be stamped onto a scope").toMatch(/\S{8,}/);
  expect(src.byId.facts).toEqual(FACT_BY_ID);
  expect(src.byId.unknowns).toEqual(UNKNOWN_BY_ID);
});

// ────────────────────────────────────── case 3: opt-in follows the source

test("optInIds(source) is the source's conclusion set, and the fixture's is OPT_IN_IDS", () => {
  const ids = [...optInIds(fixtureSource())].sort();
  expect(ids.length, "the fixture has conclusions - otherwise this test proves nothing").toBeGreaterThan(0);
  expect(ids).toEqual(CONCLUSIONS.map((c) => c.id).sort());
  expect([...OPT_IN_IDS].sort(), "the deprecated constant is the fixture's set, nothing else").toEqual(ids);
});

test("a notebook with no conclusions deals no conclusion cards and has nothing to not-take", () => {
  const src = sourceOf(NOTEBOOK, { kind: "reasoned" });
  const cards = buildCards(src);

  expect(cards.length, "the notebook's own facts are still dealt").toBeGreaterThan(20);
  expect(optInIds(src).size, "no conclusions, so nothing defaults out of scope").toBe(0);
  expect(cards.filter((c) => c.kind === "conclusion").map((c) => c.id), "the fixture's conclusions must not ride along").toEqual([]);

  const s = scopeSummary(cards, {}, src);
  expect(s.notTaken).toBe(0);
  expect(s.outOfScope, "an untouched board over this source has nothing out of scope").toBe(0);

  // The fixture's conclusion ids mean nothing to this source.
  expect(stateOf({}, CONCLUSIONS[0].id, optInIds(src)).descoped).toBe(false);
  expect(stateOf({}, CONCLUSIONS[0].id).descoped, "and the fixture default is unchanged").toBe(true);
});

test("the source's dimensions and tags decide the columns, not the market table", () => {
  const law: Dimension = {
    id: "law", label: "Law", purpose: "What the statute says.",
    emptyByOmission: "Nobody read the statute.", notApplicable: "Nothing here is governed.",
  };
  const src = sourceOf(NOTEBOOK, { kind: "reasoned", dimensions: [law], tags: { "f-ath": "law" } });
  const cards = buildCards(src);

  expect(cards.find((c) => c.id === "f-ath")?.dimension).toBe("law");
  expect(cards.find((c) => c.id === "f-now")?.dimension, "an id the source did not tag is untagged, not the-number").toBe(UNTAGGED_DIMENSION_ID);
  expect(untaggedIds(src)).not.toContain("f-ath");
  expect(untaggedIds(src)).toContain("f-now");

  const s = scopeSummary(cards, {}, src);
  expect(s.byDim.map((d) => d.id), "byDim reads the source's columns").toEqual(["law"]);
  expect(s.byDim[0].total).toBe(1);
});

test("two different notebooks do not share a digest", () => {
  const other = sourceOf({ ...NOTEBOOK, id: "another-run" }, { kind: "reasoned" });
  expect(other.digest).not.toBe(fixtureSource().digest);
  expect(sourceOf(NOTEBOOK, { kind: "reasoned" }).digest, "conclusions are part of what was dealt").not.toBe(fixtureSource().digest);
});
