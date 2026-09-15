// LANE — woundsOf WALKS ONE HOP, AND THE NOTEBOOK STAYS ONE HOP DEEP (ratchet).
//
// `woundsOf`'s docstring is the reason the whole Research step is a review
// rather than a checkbox list: "the notebook is a graph, and removing a fact can
// silently disarm a turn three beats away."
//
// The implementation walks ONE hop. It collects the explicitly-descoped ids and
// asks, per card, which of `dependsOn` are in that set. A card whose dependency
// is not descoped but is itself BROKEN — every one of ITS supports gone — is not
// in the set and is not wounded. Three beats away is exactly what it cannot see.
//
// That is not a defect today, and this probe is not a fix. Measured 2026-09-05
// over the shipped notebook: 36 cards, 24 at depth 0 and 12 at depth 1, nothing
// deeper — so a transitive rule finds precisely nothing the one-hop rule misses,
// across every single-card descope. The one-hop implementation is complete for
// the graph it actually has.
//
// It is complete BECAUSE of a property of the fixture, though, and that property
// is nowhere written down. buildCards can produce depth 2 the moment a reversal
// names a `mechanismId` whose mechanism has evidence, or a conclusion `restsOn`
// a reversal — both are shapes the builder already supports. On that day
// `woundsOf` starts under-reporting silently, on the one surface whose subject is
// what a cut costs, and the docstring will still promise three beats.
//
// So: pin the assumption, and pin that it is load-bearing. Test 1 is the ratchet.
// Test 2 drives the real function against a synthetic chain to show what the
// ratchet is protecting — without it, test 1 reads as a fact about the fixture
// rather than a constraint the code depends on.
import { test, expect } from "@playwright/test";

import { buildCards, woundsOf, type Card, type Scope } from "@/app/_phases/research/scope";

/** Longest dependsOn chain above each card, cycle-guarded. */
function depths(cards: Card[]): Map<string, number> {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const depth = new Map<string, number>();
  const open = new Set<string>();
  const of = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (open.has(id)) return 0; // a cycle is the graph probe's finding, not this one
    open.add(id);
    const c = byId.get(id);
    // A dangling id resolves to nothing and contributes no depth — that is
    // notebook-graph.probe.spec.ts's job to catch, not this one's.
    const v = !c || !c.dependsOn.length ? 0 : 1 + Math.max(...c.dependsOn.map(of));
    open.delete(id);
    depth.set(id, v);
    return v;
  };
  for (const c of cards) of(c.id);
  return depth;
}

test("the notebook is at most one dependsOn hop deep — the depth woundsOf can see", () => {
  const cards = buildCards();
  const d = depths(cards);
  const hist = new Map<number, number>();
  for (const c of cards) hist.set(d.get(c.id)!, (hist.get(d.get(c.id)!) ?? 0) + 1);
  console.log(`[wounds] ${cards.length} cards; depth histogram ${JSON.stringify([...hist.entries()].sort())}`);

  // The graph has to HAVE edges, or the constraint below is vacuous.
  expect([...d.values()].filter((v) => v > 0).length, "no card depends on any other — this probe proves nothing").toBeGreaterThan(5);

  const tooDeep = cards.filter((c) => d.get(c.id)! > 1).map((c) => `${c.id} (depth ${d.get(c.id)})`);
  expect(
    tooDeep,
    "a card now depends on a card that itself has dependencies. woundsOf walks ONE hop, so descoping the " +
      "root of that chain will wound the middle and say nothing about the tail — silently, on the surface " +
      "whose whole subject is what a cut costs. Either make woundsOf transitive (a card whose support is " +
      "BROKEN is itself wounded) or explain here why this depth is safe.",
  ).toEqual([]);
});

test("and that constraint is load-bearing: one hop is genuinely all woundsOf sees", () => {
  // A synthetic three-card chain — root <- middle <- tail — driven through the
  // REAL function. Nothing about the shipped fixture is involved, so this stays
  // true no matter what the notebook becomes, and it is what makes the ratchet
  // above a constraint rather than a note.
  const chain: Card[] = [
    { id: "root", kind: "fact", dimension: "d", title: "root", dependsOn: [] },
    { id: "middle", kind: "mechanism", dimension: "d", title: "middle", dependsOn: ["root"] },
    { id: "tail", kind: "reversal", dimension: "d", title: "tail", dependsOn: ["middle"] },
  ] as unknown as Card[];

  const scope: Scope = { root: { descoped: true, liked: false, deepen: false } };
  const wounds = woundsOf(chain, scope);
  console.log(`[wounds] descoping the root of a 3-chain wounds: ${JSON.stringify(wounds.map((w) => `${w.cardId}:${w.severity}`))}`);

  // The middle is seen, and correctly called broken — it lost all of its support.
  expect(wounds.map((w) => w.cardId)).toEqual(["middle"]);
  expect(wounds[0].severity).toBe("broken");
  // The tail rests entirely on a card that can no longer stand, and is not
  // reported. THIS is the gap the ratchet above keeps out of the real notebook.
  expect(wounds.some((w) => w.cardId === "tail"), "woundsOf became transitive — good, and the ratchet above can be relaxed").toBe(false);
});
