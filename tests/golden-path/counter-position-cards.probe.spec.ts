// LANE — COUNTER-POSITIONS ARE CARDS (operator decision 2026-10-06).
//
// A counter-position is in scope by default like a fact, attributed to its
// holder, and cuttable. The steel-man stays the only required card. Cutting
// one costs what cutting any card costs: the same woundsOf arithmetic, and the
// facts it cites wound it when they go.

import { test, expect } from "@playwright/test";

import { buildCards, notebookIssues, type Card } from "@/app/_phases/_shared/notebook/cards";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { sourceOf } from "@/app/_phases/_shared/notebook/source";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { KIND_LABEL } from "@/app/_phases/research/_parts/CardTile";
import { scopeSummary, stateOf, woundsOf, type Scope } from "@/app/_phases/research/scope";
import { KIND_ICON } from "@/app/board/look";

const typed: Notebook = {
  ...NOTEBOOK,
  counterPositions: [
    { position: "The drawdown is the ordinary post-halving cycle", holder: "cycle believers", evidence: ["f-supply-2pct", "f-ath"] },
  ],
};
const legacy: Notebook = { ...NOTEBOOK, counterPositions: ["a bare legacy string"] };
const counters = (cs: Card[]) => cs.filter((c) => c.kind === "counter");

test("1 · one counter card per typed counter-position: title, holder, edges", () => {
  const cs = counters(buildCards(typed));
  expect(cs.length).toBe(1);
  const t = cs[0];
  expect(t.title).toBe("The drawdown is the ordinary post-halving cycle");
  expect(t.holder).toBe("cycle believers");
  expect(t.dependsOn).toEqual(["f-supply-2pct", "f-ath"]);
});

test("2 · a legacy string is a card with no holder and no edges", () => {
  const c = counters(buildCards(legacy))[0];
  expect(c.title).toBe("a bare legacy string");
  expect(c.holder).toBeUndefined();
  expect(c.dependsOn).toEqual([]);
  const all = buildCards(legacy);
  expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
});

test("3 · counters are not required; the steel-man is the only required card", () => {
  const cards = buildCards(typed);
  expect(counters(cards).every((c) => !c.required && !c.optIn)).toBe(true);
  expect(cards.filter((c) => c.required).map((c) => c.id)).toEqual(["steel-man"]);
});

test("4 · a counter is cuttable and wounded by the facts it cites", () => {
  const cards = buildCards(typed);
  const [t] = counters(cards);
  const src = sourceOf(typed);
  // in by default
  expect(stateOf({}, t.id).descoped).toBe(false);
  // cutting the counter is a decision, not a block
  const cutIt: Scope = { [t.id]: { descoped: true, liked: false, deepen: false } };
  expect(scopeSummary(cards, cutIt, src).blocked).toBe(false);
  // cutting its evidence wounds it
  const cutFacts: Scope = Object.fromEntries(
    ["f-supply-2pct", "f-ath"].map((id) => [id, { descoped: true, liked: false, deepen: false }]),
  );
  const w = woundsOf(cards, cutFacts).find((x) => x.cardId === t.id);
  expect(w?.severity).toBe("broken");
  expect(notebookIssues(typed).filter((i) => i.kind === "dangling-ref")).toEqual([]);
});

test("5 · every per-kind table has the new kind", () => {
  expect(KIND_LABEL.counter).toBeTruthy();
  expect(KIND_ICON.counter).toBeTruthy();
});

test("6 · the fixture's four-year-cycle counter is a scopeable card", () => {
  const c = buildCards().find((x) => x.kind === "counter" && /Four-year-cycle/.test(x.title));
  expect(c, "run 1's strongest counter has a card").toBeTruthy();
  expect(stateOf({ [c!.id]: { descoped: true, liked: false, deepen: false } }, c!.id).descoped).toBe(true);
});
