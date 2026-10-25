// LANE — THE SIMULATED RECALIBRATION ANSWERS FOR EVERY NOTE (dynamic).
//
// recalibrate() acts on descope / more-focus / less-focus only. A move-earlier,
// move-later or custom note changed nothing and left no record, while the file
// states that a note which cannot be honoured is refused whoever holds the pen.
// The model path keeps those notes (the model reads their text), so the refusal
// is the simulated engine's alone: recalibrateFromPlan must not grow one.
import { test, expect } from "@playwright/test";

import { buildCards } from "@/lib/notebook/cards";
import { recalibrate, recalibrateFromPlan } from "@/lib/script/recalibrate";
import type { EditPlan } from "@/lib/script/editPlan";
import { BASELINE, type Note } from "@/lib/script/versions";

const ctx = () => ({ cards: buildCards(), scope: {} });
const emptyPlan = (): EditPlan => ({ edits: [], refusals: [], summary: "no edits" });
const card = () => buildCards().find((c) => !c.required)!.id;

const notes = (): Note[] => [
  { id: "n1", cardId: card(), kind: "move-earlier", at: 1 },
  { id: "n2", cardId: card(), kind: "move-later", at: 2 },
  { id: "n3", cardId: card(), kind: "custom", text: "open on the harbour", at: 3 },
];

test("a move or free-text note on the simulated path is refused, one refusal per note kind", () => {
  const v = recalibrate(BASELINE, notes(), "v2", 1, ctx());
  expect(v.refusals.map((r) => r.kind).sort()).toEqual(["custom", "move-earlier", "move-later"]);
  for (const r of v.refusals) {
    expect(r.cardId).toBe(card());
    expect(r.why.length).toBeGreaterThan(0);
  }
});

test("a note the simulated engine does act on is not refused as inert", () => {
  const n: Note[] = [{ id: "n1", cardId: card(), kind: "more-focus", at: 1 }];
  expect(recalibrate(BASELINE, n, "v2", 1, ctx()).refusals).toEqual([]);
});

test("the model path keeps the same notes: no inert refusal is added there", () => {
  const v = recalibrateFromPlan(BASELINE, notes(), emptyPlan(), "v2", 1, ctx());
  expect(v.refusals.filter((r) => r.kind !== "descope")).toEqual([]);
});
