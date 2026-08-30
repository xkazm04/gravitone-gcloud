// LANE — THE CARD FLATTENING NO LONGER DROPS STRUCTURED SOURCES (static + data).
//
// `notebook-source-ladder.probe.spec.ts` covers the migration from the FIXTURE
// side: it counts how many facts carry `sources[]` instead of the deprecated
// `source` string, and pins that count so it cannot regress quietly. It does
// not, and by its own scope should not, ask whether anything downstream of
// `facts.ts` actually reads the field it is counting.
//
// Something didn't: `buildCards()` (app/_phases/_shared/notebook/cards.ts) is
// the one place a `Fact` becomes a triage-board `Card`, and its fact branch
// wrote `source: f.source` while never mentioning `sources` at all — so the
// one migrated row, `f-midtier-distribute`, had an evidence class the
// researcher authored, `notebook-source-ladder.probe.spec.ts` counted as
// present, and NO card on the board that decides what a script may use could
// ever show. The render path was proven (FactRow.tsx draws it on the evidence
// log via `EvidenceClassChip`) and the flattening between the fixture and the
// board was the blind spot.
//
// This probe tests the DATA path, matching this lane's own idiom for a Node
// test with no DOM: assert what `buildCards()` actually carries, not how a
// component paints it. The one exception is the last test below, which reads
// `CardTile.tsx` as TEXT — because a data-path probe alone can pass against a
// component that receives `card.sources` and still ignores it, which is
// exactly the shape of the bug being fixed one layer up. Proving the field
// survives the flatten is necessary; proving the one consumer that draws cards
// for a human actually reads it is why this file exists rather than being a
// paragraph added to the source-ladder probe.

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { FACTS } from "@/app/_phases/_shared/notebook/facts";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";

const LADDER = ["primary", "secondary", "aggregator", "vendor", "self-published", "protected"];

test("a migrated fact's card carries its structured sources, not just the flattened string", () => {
  const cards = buildCards(NOTEBOOK);
  const card = cards.find((c) => c.id === "f-midtier-distribute");
  expect(card, "f-midtier-distribute has no card at all — buildCards dropped the fact, not just its sources").toBeTruthy();

  // Prove the fixture itself still carries what this probe is about to check
  // survived the flatten — a probe that reads the fixture's own state as
  // vacuously true is a probe that always passes.
  const fact = FACTS.find((f) => f.id === "f-midtier-distribute");
  expect(fact?.sources?.length, "the migrated fixture row lost its own sources[] — this probe is testing the wrong thing").toBeGreaterThan(0);

  expect(card!.sources?.length, "buildCards() produced a card with no `sources` for the one fact the notebook migrated — the flatten dropped it").toBeGreaterThan(0);
  for (const s of card!.sources!) {
    expect(s.name.trim(), "a source carried onto the card with no name").not.toBe("");
    expect(LADDER, `"${s.evidenceClass}" is not a real rung of the evidence ladder — the card carried a value nothing in EvidenceClass names`).toContain(s.evidenceClass);
  }
});

test("unmigrated facts still carry their legacy `source` string, and carry no `sources`", () => {
  const cards = buildCards(NOTEBOOK);
  const unmigrated = FACTS.filter((f) => !f.sources?.length);
  expect(unmigrated.length, "every fact is migrated — this branch of the probe has nothing left to guard; delete it rather than leave it vacuous").toBeGreaterThan(0);

  for (const f of unmigrated) {
    const card = cards.find((c) => c.id === f.id);
    expect(card, `${f.id} has no card`).toBeTruthy();
    expect(card!.source, `${f.id}: an unmigrated fact's card lost its legacy \`source\` string`).toBe(f.source);
    expect(card!.sources, `${f.id}: an unmigrated fact's card carries a \`sources\` array it has no fixture data for — invented, not carried`).toBeUndefined();
  }
});

test("only fact cards ever carry sources — mechanisms, reversals and conclusions have none to lose", () => {
  const cards = buildCards(NOTEBOOK);
  for (const c of cards) {
    if (c.kind === "fact") continue;
    expect(c.sources, `${c.id} (${c.kind}) carries a \`sources\` array — buildCards must not invent one for a card kind with no source field on its notebook type`).toBeUndefined();
  }
});

test("the call site reads card.sources, not just card.source — a data-path probe alone cannot catch a component that ignores the field", () => {
  const raw = readFileSync("app/_phases/research/_parts/CardTile.tsx", "utf-8");
  // Comment-stripped so a mention inside a comment (this very fix, described
  // in prose) cannot satisfy the assertion in place of the real read. This is
  // the exact trap the finding names: the render path already existed one
  // layer up in FactRow.tsx, so it is easy for a file to TALK about
  // `card.sources` — in a comment explaining why it now matters — without ever
  // reading it in code that runs.
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  expect(stripped, "no comment-stripped occurrence of `card.sources` in CardTile.tsx — the component still only reads the flattened `card.source` string, which is precisely the bug this whole probe exists to catch one layer up from the data path").toMatch(/card\.sources/);
});
