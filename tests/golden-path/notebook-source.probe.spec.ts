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
  ["counter-1", "counter", "counter-case", "", 0, 0],
  ["counter-2", "counter", "counter-case", "", 0, 0],
  ["counter-3", "counter", "counter-case", "", 0, 0],
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

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2 - the notebook carries its own columns and conclusions.
//
// `dimensions[]`, `Fact/Mechanism/Reversal.dimension` and `conclusions[]` are
// OPTIONAL fields of the contract (pipeline/NOTEBOOK-SCHEMA.md, Dimensions and
// conclusions). A notebook that declares none of them is every notebook stored
// before this change, and it must validate exactly as it did; one that declares
// them is checked against its OWN columns and conclusions instead of the fixture
// filters lib/notebook/validate.ts needed while the fixture's tables were the
// only ones there were.
// ═══════════════════════════════════════════════════════════════════════════

import { notebookIssues } from "@/app/_phases/_shared/notebook/cards";
import type { Conclusion } from "@/app/_phases/_shared/notebook/conclusions";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { NotebookError, parseNotebook } from "@/lib/notebook/validate";

import { loadCassette, type CassetteTurn } from "./_helpers";

/** A schema-valid notebook: the retrieval cassette's answer, which the shape half
 *  accepts today (research-retrieve.probe.spec.ts parses it). */
const RAW = (loadCassette("research-retrieve").turns[0]! as CassetteTurn).resultJson as Record<string, unknown>;
const raw = () => structuredClone(RAW);

const COLUMNS: Dimension[] = [
  { id: "volume", label: "Volume", purpose: "How much moved.", emptyByOmission: "Nobody measured it.", notApplicable: "Nothing moved." },
  { id: "rate", label: "Rate", purpose: "What it cost.", emptyByOmission: "Nobody priced it.", notApplicable: "Nothing was charged." },
];

/** The cassette notebook with every Fact/Mechanism/Reversal tagged to a column. */
function declared(): Record<string, unknown> {
  const nb = raw() as {
    facts: { id: string; dimension?: string }[];
    mechanisms: { dimension?: string }[];
    reversals: { dimension?: string }[];
  };
  nb.facts.forEach((f, i) => (f.dimension = i % 2 ? "rate" : "volume"));
  nb.mechanisms.forEach((m) => (m.dimension = "volume"));
  nb.reversals.forEach((r) => (r.dimension = "rate"));
  return { ...nb, dimensions: structuredClone(COLUMNS) };
}

const conclusion = (id: string): Conclusion => ({
  id,
  claim: `Claim ${id}`,
  reasoning: "Because the dredging volume and the rate disagree.",
  leap: "moderate",
  restsOn: ["f-volume", "f-rate"],
  falsifiableBy: "A harbour authority invoice.",
  useFor: "thesis",
});

const kindsOf = (nb: Notebook) => notebookIssues(nb).map((i) => i.kind);

function rejection(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(NotebookError);
    return (e as NotebookError).findings;
  }
  throw new Error("accepted a notebook it should have refused");
}

// ------------------------------------- (a) a notebook with no fields is unchanged

test("stage 2 (a): a notebook with no dimensions field validates as before - untagged is not reported", () => {
  const nb = parseNotebook(raw(), "harbour dredging costs");
  expect("dimensions" in nb, "the validator invented a field").toBe(false);
  expect("conclusions" in nb).toBe(false);
  // The graph WOULD call every card untagged against the fixture's table; the
  // validator is what suppresses that for a notebook that never claimed columns.
  expect(kindsOf(nb)).toContain("untagged");
  // And it is dealt the way it always was: the fixture's conclusions and tags.
  expect(buildCards(nb).some((c) => c.kind === "conclusion")).toBe(true);
});

// ------------------------------------- (b) declared dimensions, checked for real

test("stage 2 (b): a notebook that tags every card has no untagged and no stale-tag finding", () => {
  const nb = parseNotebook(declared(), "harbour dredging costs");
  const kinds = kindsOf(nb);
  expect(kinds.filter((k) => k === "untagged")).toEqual([]);
  expect(kinds.filter((k) => k === "stale-tag")).toEqual([]);
  expect(kinds, "a declared notebook has nothing else wrong with it either").toEqual([]);

  const src = sourceOf(nb);
  expect(src.dimensions.map((d) => d.id)).toEqual(["volume", "rate"]);
  expect(src.tagOf("f-volume")).toBe("volume");
  expect(src.tagOf("r-rate")).toBe("rate");
  expect(untaggedIds(src)).toEqual([]);
});

test("stage 2 (b): one untagged card in a declaring notebook is exactly one finding, and the validator now says so", () => {
  const nb = declared() as { facts: { id: string; dimension?: string }[] };
  delete nb.facts[2].dimension;

  const findings = rejection(() => parseNotebook(nb, "harbour dredging costs"));
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatch(/^\[untagged\]/);
  expect(findings[0]).toContain(nb.facts[2].id);
  expect(notebookIssues({ scaleConversions: [], analogyCandidates: [], counterPositions: [], ...nb } as unknown as Notebook).filter((i) => i.kind === "untagged").map((i) => i.ref)).toEqual([nb.facts[2].id]);
});

test("stage 2 (b): a tag naming a column the notebook did not declare is refused", () => {
  const nb = declared() as { facts: { dimension?: string }[] };
  nb.facts[0].dimension = "not-a-column";
  expect(rejection(() => parseNotebook(nb, "x")).join(" ")).toMatch(/facts\[0\]\.dimension.*not-a-column/);
});

// ------------------------------------- (c) the notebook's own conclusions

test("stage 2 (c): sourceOf deals the notebook's conclusions, and they are the opt-in set", () => {
  const nb = parseNotebook({ ...declared(), conclusions: [conclusion("c-one"), conclusion("c-two")] }, "harbour dredging costs");
  const src = sourceOf(nb);

  expect(src.conclusions.map((c) => c.id)).toEqual(["c-one", "c-two"]);
  expect([...optInIds(src)].sort()).toEqual(["c-one", "c-two"]);
  expect(buildCards(src).filter((c) => c.kind === "conclusion").map((c) => c.id)).toEqual(["c-one", "c-two"]);
  // The bare-notebook spelling means the same thing for a notebook that declares them.
  expect(buildCards(nb).filter((c) => c.kind === "conclusion").map((c) => c.id)).toEqual(["c-one", "c-two"]);
  expect(notebookIssues(nb)).toEqual([]);
});

test("stage 2 (c): a conclusion resting on a fact that does not exist is a dangling reference", () => {
  const nb = { ...declared(), conclusions: [{ ...conclusion("c-one"), restsOn: ["f-no-such-fact"] }] };
  expect(rejection(() => parseNotebook(nb, "x")).join(" ")).toMatch(/dangling-ref\] c-one\.dependsOn → f-no-such-fact/);
});

test("stage 2 (c): a fresh notebook with none gets no conclusion cards and no finding owned by the fixture's", () => {
  const nb = parseNotebook(raw(), "harbour dredging costs");
  const src = sourceOf(nb);
  expect(buildCards(src).filter((c) => c.kind === "conclusion")).toEqual([]);

  const ownedByFixture = new Set(CONCLUSIONS.map((c) => c.id));
  const stray = notebookIssues(src).filter((i) => ownedByFixture.has(i.from.split(".")[0]));
  expect(stray, "the fixture's conclusions rode in behind the notebook").toEqual([]);
});

// ------------------------------------- (d) the door

test("stage 2 (d): parseNotebook accepts the optional fields and keeps them", () => {
  const nb = parseNotebook({ ...declared(), conclusions: [conclusion("c-one")] }, "harbour dredging costs");
  expect(nb.dimensions?.map((d) => d.id)).toEqual(["volume", "rate"]);
  expect(nb.conclusions?.map((c) => c.id)).toEqual(["c-one"]);
  expect(nb.facts[0].dimension).toBe("volume");
});

test("stage 2 (d): parseNotebook refuses a malformed dimensions or conclusions value", () => {
  const bad = (patch: Record<string, unknown>) => rejection(() => parseNotebook({ ...declared(), ...patch }, "x")).join(" ");

  expect(bad({ dimensions: "volume" })).toMatch(/`dimensions` must be an array/);
  expect(bad({ dimensions: [{ id: "volume" }] })).toMatch(/dimensions\[0\]\.label/);
  expect(bad({ dimensions: [{ ...COLUMNS[0] }, { ...COLUMNS[0] }] })).toMatch(/dimensions\[1\]\.id.*volume.*twice/);
  expect(bad({ conclusions: {} })).toMatch(/`conclusions` must be an array/);
  expect(bad({ conclusions: [{ ...conclusion("c-one"), claim: undefined }] })).toMatch(/conclusions\[0\]\.claim/);
  expect(bad({ conclusions: [{ ...conclusion("c-one"), leap: "huge" }] })).toMatch(/conclusions\[0\]\.leap/);
  expect(bad({ conclusions: [{ ...conclusion("c-one"), restsOn: "f-volume" }] })).toMatch(/conclusions\[0\]\.restsOn/);
});

// ------------------------------------- (e) the fixture is the control

test("stage 2 (e): the fixture declares neither field, so it keeps its own tables and a clean graph", () => {
  expect("dimensions" in NOTEBOOK).toBe(false);
  expect("conclusions" in NOTEBOOK).toBe(false);
  expect(notebookIssues()).toEqual([]);
  expect(
    buildCards(fixtureSource()).map((c) => [c.id, c.kind, c.dimension, c.dependsOn.join(" "), c.optIn ? 1 : 0, c.required ? 1 : 0]),
  ).toEqual(TODAY);
});
