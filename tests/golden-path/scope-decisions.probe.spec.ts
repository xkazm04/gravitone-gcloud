// LANE — WHAT THE SCOPE DECISIONS ACTUALLY COST (dynamic).
//
// `app/_phases/research/scope.ts` decides what reaches the Script step:
// `scopeSummary().blocked` is the gate on confirming, and `woundsOf` is the
// arithmetic that the step's own header calls "the whole reason the step exists
// as a review rather than a checkbox list". Measured 2026-08-29: no probe in
// this repository imported any of it. `notebook-graph.probe.spec.ts` next door
// covers `cards.ts` — the notebook flattened — and stops there; the only thing
// tests/ reached inside app/_phases/research was `slotsFor`, imported by two
// probes that belong to other steps.
//
// These are pure functions over a card graph, which is exactly this lane's job.
//
// THE FIXTURES ARE HAND-BUILT, not derived. A test that constructs its expected
// answer the way the implementation constructs its real one agrees with the
// implementation by definition — including when both are wrong. So the graph
// cases below are five cards written out here, and the two cases that must speak
// about the SHIPPED board assert a property of it rather than a number read back
// off the same list.

import { test, expect } from "@playwright/test";

import { buildCards, type Card } from "@/app/_phases/_shared/notebook/cards";
import { DIMENSIONS } from "@/app/_phases/_shared/notebook/dimensions";
import {
  OPT_IN_IDS,
  scopeDiffs,
  scopeSummary,
  stateOf,
  woundsOf,
  type Scope,
} from "@/app/_phases/research/scope";

const DIM = DIMENSIONS[0].id;

/** Two facts, a mechanism that needs both, a reversal that needs only one, and
 *  a required card. Written out rather than flattened from the notebook. */
function graph(): Card[] {
  return [
    { id: "f-a", kind: "fact", dimension: DIM, title: "fact A", dependsOn: [] },
    { id: "f-b", kind: "fact", dimension: DIM, title: "fact B", dependsOn: [] },
    { id: "m-both", kind: "mechanism", dimension: DIM, title: "needs both facts", dependsOn: ["f-a", "f-b"] },
    { id: "r-one", kind: "reversal", dimension: DIM, title: "needs only A", dependsOn: ["f-a"] },
    { id: "req", kind: "fact", dimension: DIM, title: "cannot be cut", dependsOn: [], required: true, requiredWhy: "the library forbids it" },
  ];
}

const cut = (...ids: string[]): Scope =>
  Object.fromEntries(ids.map((id) => [id, { descoped: true, liked: false, deepen: false }]));

test("a card losing SOME support is weakened; losing ALL of it is broken", () => {
  const cards = graph();

  // f-a gone: the mechanism keeps f-b, the reversal keeps nothing.
  const wounds = woundsOf(cards, cut("f-a"));
  const by = Object.fromEntries(wounds.map((w) => [w.cardId, w]));

  expect(Object.keys(by).sort(), "exactly the two dependants are wounded").toEqual(["m-both", "r-one"]);
  expect(by["m-both"].severity, "one of two supports survives").toBe("weakened");
  expect(by["r-one"].severity, "its only support is gone").toBe("broken");
  expect(by["r-one"].missing).toEqual(["f-a"]);
});

test("a descoped card is not itself a wound — it is the cause of one", () => {
  const wounds = woundsOf(graph(), cut("f-a", "f-b"));
  expect(
    wounds.map((w) => w.cardId),
    "a cut card must never appear as its own casualty, or the panel double-counts every decision",
  ).not.toContain("f-a");
  // Both supports gone now, so the mechanism joins the reversal.
  expect(wounds.find((w) => w.cardId === "m-both")?.severity).toBe("broken");
});

test("the gate is required-cards-only: wounds warn, a required cut blocks", () => {
  const cards = graph();

  const wounded = scopeSummary(cards, cut("f-a"));
  expect(wounded.wounds.length, "the cut wounded two cards").toBe(2);
  expect(wounded.blocked, "wounds are reported, never a block — the creator may accept the cost").toBe(false);

  const blocked = scopeSummary(cards, cut("req"));
  expect(blocked.blocked, "a required card out of scope is the one thing that blocks").toBe(true);
  expect(blocked.requiredGone.map((c) => c.id)).toEqual(["req"]);
});

test("divergence tracks kept-or-cut only — liking and deepening move nothing", () => {
  const cards = graph();
  const base: Scope = {};
  const liked: Scope = { "f-a": { descoped: false, liked: true, deepen: true } };

  expect(
    scopeDiffs(cards, base, liked),
    "liked and deepen are a preference and a next-run request; neither changes what the script may use, so neither may raise a divergence warning",
  ).toEqual([]);

  expect(scopeDiffs(cards, base, cut("f-b")), "a cut is the movement that counts").toEqual(["f-b"]);
});

// ─────────────────────────────────────────────────────────── the shipped board

test("an untouched board reports no decisions — the alarm is not lit on arrival", () => {
  const s = scopeSummary(buildCards(), {});

  // The regression this pins, in scope.ts's own words: `descoped` used to be
  // `total - kept`, which folded in the conclusions that read as out of scope BY
  // DEFAULT — so a board nobody had touched opened with an amber "descoped N".
  // Asserted as zero rather than against a count taken from CONCLUSIONS, which
  // is where the implementation gets its own answer.
  expect(s.descoped, "nobody has cut anything yet").toBe(0);
  expect(s.liked).toBe(0);
  expect(s.deepen).toBe(0);
  expect(s.blocked, "an untouched board cannot be blocked").toBe(false);

  // And the opt-ins are still accounted for, in the bucket that is not a
  // decision. Non-zero rather than a number: that there ARE opt-in cards is the
  // premise this test needs; how many is the fixture's business.
  expect(s.notTaken, "the opt-in cards are counted as not-taken, not as cut").toBeGreaterThan(0);
  expect(s.outOfScope, "everything out of scope on arrival got there by default").toBe(s.notTaken);
});

test("the opt-in rule has one meaning: the default and the label cannot disagree", () => {
  const cards = buildCards();

  // TWO INDEPENDENT PATHS TO ONE RULE, pinned because nothing else pins them.
  // `stateOf` takes its default from OPT_IN_IDS (built from the conclusion set);
  // `scopeSummary` and CardTile's ScopeChip take their wording from the card's
  // own `optIn` field. Both are populated from CONCLUSIONS today, by separate
  // code, so they agree by construction rather than by design — and an opt-in
  // card that is not a conclusion would default IN scope while being labelled as
  // an opt-in, silently retiring the safeguard the asymmetry exists to be.
  const byDefault = cards.filter((c) => stateOf({}, c.id).descoped).map((c) => c.id).sort();
  const byField = cards.filter((c) => c.optIn).map((c) => c.id).sort();

  expect(
    byDefault,
    "a card that starts out of scope and a card labelled opt-in must be the same card — see stateOf/OPT_IN_IDS against Card.optIn",
  ).toEqual(byField);

  expect(byField.length, "the board has opt-in cards at all - otherwise this test proves nothing").toBeGreaterThan(0);
  // And the set really is the conclusion set, not something that merely has the
  // same size.
  expect(byField.every((id) => OPT_IN_IDS.has(id))).toBe(true);
});
