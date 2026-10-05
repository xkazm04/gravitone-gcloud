// LANE — SCRIPT PHASE: Scope conflict detection, resolution plan, and candidate delta (dynamic probe).
//
// Demonstrates that scope decisions (cards descoped on the triage board) that
// conflict with candidate renders (materials still spoken in one or more cuts)
// are detected, can be staged for resolution in a single action, and report
// their before/after delta when recalibrated.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import type { Scope } from "@/app/_phases/research/scope";
import {
  conflictsIn,
  resolutionPlan,
  conflictDelta,
} from "@/app/_phases/script/scopeConflicts";
import { recalibrate } from "@/app/_phases/script/recalibrate";
import { BASELINE, type Note } from "@/app/_phases/script/versions";
import { stripComments } from "./_helpers";

test("case 1: scope{f-ath: descoped, f-sbr: descoped} -> conflictsIn(BASELINE, cards, scope) returns exactly ['f-ath', 'f-sbr']", () => {
  const cards = buildCards();
  const scope: Scope = {
    "f-ath": { descoped: true, liked: false, deepen: false },
    "f-sbr": { descoped: true, liked: false, deepen: false },
  };
  const conflicts = conflictsIn(BASELINE, cards, scope);
  expect(conflicts).toEqual(["f-ath", "f-sbr"]);
});

test("case 2: resolutionPlan(BASELINE, cards, scope, []) -> stage contains exactly [{cardId:'f-ath', kind:'descope'}, {cardId:'f-sbr', kind:'descope'}], skipped is empty, contested is empty", () => {
  const cards = buildCards();
  const scope: Scope = {
    "f-ath": { descoped: true, liked: false, deepen: false },
    "f-sbr": { descoped: true, liked: false, deepen: false },
  };
  const plan = resolutionPlan(BASELINE, cards, scope, []);
  expect(plan.stage).toEqual([
    { cardId: "f-ath", kind: "descope" },
    { cardId: "f-sbr", kind: "descope" },
  ]);
  expect(plan.skipped).toEqual([]);
  expect(plan.contested).toEqual([]);
});

test("case 3: notes already holds {cardId:'f-ath', kind:'descope'} -> stage contains only f-sbr (no duplicate note)", () => {
  const cards = buildCards();
  const scope: Scope = {
    "f-ath": { descoped: true, liked: false, deepen: false },
    "f-sbr": { descoped: true, liked: false, deepen: false },
  };
  const existingNotes: Note[] = [
    { id: "n-f-ath-1", cardId: "f-ath", kind: "descope", at: 1 },
  ];
  const plan = resolutionPlan(BASELINE, cards, scope, existingNotes);
  expect(plan.stage).toEqual([{ cardId: "f-sbr", kind: "descope" }]);
  expect(plan.skipped).toEqual([]);
  expect(plan.contested).toEqual([]);
});

test("case 4: notes holds {cardId:'f-ath', kind:'more-focus'} -> f-ath is in contested with why explaining the conflict, and NOT in stage", () => {
  const cards = buildCards();
  const scope: Scope = {
    "f-ath": { descoped: true, liked: false, deepen: false },
    "f-sbr": { descoped: true, liked: false, deepen: false },
  };
  const existingNotes: Note[] = [
    { id: "n-f-ath-1", cardId: "f-ath", kind: "more-focus", at: 1 },
  ];
  const plan = resolutionPlan(BASELINE, cards, scope, existingNotes);
  expect(plan.stage).toEqual([{ cardId: "f-sbr", kind: "descope" }]);
  expect(plan.contested.length).toBe(1);
  expect(plan.contested[0].cardId).toBe("f-ath");
  expect(plan.contested[0].why).toBeTruthy();
  expect(typeof plan.contested[0].why).toBe("string");
  expect(plan.stage.some((s) => s.cardId === "f-ath")).toBe(false);
  expect(plan.skipped).toEqual([]);
});

test("case 5: scope{steel-man: descoped} -> conflictsIn lists steel-man (spoken at reversal-chain 3:15) but resolutionPlan puts it in skipped with why === steel-man's requiredWhy and stages nothing for it (GUARD 1 would refuse the note)", () => {
  const cards = buildCards();
  const steelManCard = cards.find((c) => c.id === "steel-man");
  expect(steelManCard).toBeDefined();
  expect(steelManCard?.required).toBe(true);

  const scope: Scope = {
    "steel-man": { descoped: true, liked: false, deepen: false },
  };
  const conflicts = conflictsIn(BASELINE, cards, scope);
  expect(conflicts).toContain("steel-man");

  const plan = resolutionPlan(BASELINE, cards, scope, []);
  expect(plan.skipped).toEqual([
    { cardId: "steel-man", why: steelManCard!.requiredWhy },
  ]);
  expect(plan.stage).toEqual([]);
  expect(plan.contested).toEqual([]);
});

test("case 6: cand = recalibrate(BASELINE, notes built from resolutionPlan's stage, 'v2', 1, {cards, scope}) -> conflictDelta(BASELINE, cand, cards, scope) = {before: 2, after: 0, resolved: ['f-ath','f-sbr'], remaining: []}", () => {
  const cards = buildCards();
  const scope: Scope = {
    "f-ath": { descoped: true, liked: false, deepen: false },
    "f-sbr": { descoped: true, liked: false, deepen: false },
  };
  const plan = resolutionPlan(BASELINE, cards, scope, []);
  const stagedNotes: Note[] = plan.stage.map((s, idx) => ({
    id: `n-${s.cardId}-${s.kind}-${idx}`,
    cardId: s.cardId,
    kind: s.kind,
    at: idx,
  }));
  const cand = recalibrate(BASELINE, stagedNotes, "v2", 1, { cards, scope });
  const delta = conflictDelta(BASELINE, cand, cards, scope);
  expect(delta).toEqual({
    before: 2,
    after: 0,
    resolved: ["f-ath", "f-sbr"],
    remaining: [],
  });
});

test("case 7 (declared GUARD): conflictsIn(BASELINE, cards, {}) -> [] (every conclusion is opt-in OUT by default and no baseline render speaks one)", () => {
  const cards = buildCards();
  const conflicts = conflictsIn(BASELINE, cards, {});
  expect(conflicts).toEqual([]);
});

test("case 8 (source ratchet): _matrix/shared.tsx renders data-testid=\"resolve-scope-conflicts\" and calls resolutionPlan; ScriptStep.tsx's coverage tally reads conflictsIn rather than an inline stillSpoken filter", () => {
  const sharedRaw = readFileSync(resolve(process.cwd(), "app/_phases/script/_matrix/shared.tsx"), "utf-8");
  const sharedCode = stripComments(sharedRaw);
  expect(sharedCode).toContain('data-testid="resolve-scope-conflicts"');
  expect(sharedCode).toContain("resolutionPlan(");

  const stepRaw = readFileSync(resolve(process.cwd(), "app/_phases/script/ScriptStep.tsx"), "utf-8");
  const stepCode = stripComments(stepRaw);
  expect(stepCode).toContain("conflictsIn(");
  expect(stepCode).not.toContain("stillSpoken");
});
