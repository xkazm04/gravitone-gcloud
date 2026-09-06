// LANE — THE CONSEQUENCES PANEL COUNTS WHAT IT SAYS IT COUNTS (dynamic).
//
// scope.ts splits two counts on purpose and states the reason at length:
// `descoped` is what the creator CUT, `notTaken` is the opt-in conclusions that
// read as out of scope BY DEFAULT. Folding them together "lit this stat amber on
// arrival, because the conclusions start out of scope by design" — an alarm lit
// before anyone has decided anything.
//
// The Consequences panel then had one branch honouring that split and the next
// one not. The no-cuts branch says "Nothing descoped… minus the N conclusions you
// have not taken." The has-cuts branch was titled `${s.descoped} cards out of
// scope` — the CUT count, under the words that name the OTHER field. Measured on
// the shipped notebook (36 cards, 7 opt-in): cutting one card announced "1 card
// out of scope" while 8 were, and the gap is a flat 7 in every reachable case.
//
// The fix is not to swap in `outOfScope`, which would re-light the alarm the
// split exists to prevent. It titles the DECISION and lets the body carry the
// total. This probe drives `cutCopy` — the real function the panel renders, not
// a restatement of it — against the real card set.
import { test, expect } from "@playwright/test";

import { buildCards, scopeSummary, type Card, type Scope } from "@/app/_phases/research/scope";
import { cutCopy } from "@/app/_phases/research/_parts/ScopeBar";

const cards = buildCards();

/** Cards that can be cut without wounding anything — the state in which the
 *  panel renders this branch at all. */
function cuttable(): Card[] {
  const dependedOn = new Set(cards.flatMap((c) => c.dependsOn));
  return cards.filter((c) => !c.optIn && !dependedOn.has(c.id));
}

function cut(n: number): Scope {
  const scope: Scope = {};
  for (const c of cuttable().slice(0, n)) scope[c.id] = { descoped: true, liked: false, deepen: false };
  return scope;
}

test("the fixture still has both kinds — otherwise this probe proves nothing", () => {
  const optIn = cards.filter((c) => c.optIn).length;
  console.log(`[scope-copy] ${cards.length} cards, ${optIn} opt-in, ${cuttable().length} cuttable without wounds`);
  // If the notebook ever loses its opt-in conclusions, the two counts coincide
  // and every assertion below passes for the wrong reason.
  expect(optIn, "no opt-in cards left — the descoped/notTaken split is untested").toBeGreaterThan(0);
  expect(cuttable().length, "nothing can be cut without wounding — this branch is unreachable").toBeGreaterThan(2);
});

test("the title counts CUTS, and never silently means something else", () => {
  for (const n of [1, 2, 3]) {
    const s = scopeSummary(cards, cut(n));
    const { title } = cutCopy(s);
    console.log(`[scope-copy] cut ${n} -> "${title}" (descoped ${s.descoped}, notTaken ${s.notTaken}, outOfScope ${s.outOfScope})`);
    expect(s.descoped, "the fixture did not cut what this probe asked it to").toBe(n);
    expect(title).toBe(`${n} card${n === 1 ? "" : "s"} cut`);
    // The words that name the wider set must not appear over the narrower count.
    expect(
      /out of scope/.test(title) && !title.includes(String(s.outOfScope)),
      `the title says "out of scope" while counting ${s.descoped} of ${s.outOfScope}`,
    ).toBe(false);
  }
});

test("the body accounts for every card the Script step will not see", () => {
  const s = scopeSummary(cards, cut(2));
  const { alsoNotTaken } = cutCopy(s);
  console.log(`[scope-copy] body -> ${alsoNotTaken}`);
  expect(alsoNotTaken, "a board with untaken conclusions must say so here").toBeTruthy();
  // The total is the one number a reader can check against the board.
  expect(alsoNotTaken).toContain(`${s.outOfScope} of ${s.total}`);
  expect(alsoNotTaken).toContain(String(s.notTaken));
  expect(s.descoped + s.notTaken, "outOfScope is no longer the sum of its two parts").toBe(s.outOfScope);
});

test("with nothing untaken there is no second sentence to ignore", () => {
  // Every opt-in card taken into scope: the note has nothing left to report and
  // must not render an empty or zero-valued clause.
  const scope: Scope = {};
  for (const c of cards.filter((x) => x.optIn)) scope[c.id] = { descoped: false, liked: false, deepen: false };
  for (const c of cuttable().slice(0, 1)) scope[c.id] = { descoped: true, liked: false, deepen: false };
  const s = scopeSummary(cards, scope);
  console.log(`[scope-copy] all conclusions taken -> notTaken ${s.notTaken}, outOfScope ${s.outOfScope}`);
  expect(s.notTaken).toBe(0);
  expect(cutCopy(s).alsoNotTaken).toBeNull();
});
