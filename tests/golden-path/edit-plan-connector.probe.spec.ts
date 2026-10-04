// LANE 2b — AN INSERTED BEAT'S CONNECTOR IS DECLARED, NEVER DEFAULTED (dynamic).
//
// `Beat.connector` is a claim about the beat in front of it: BUT or THEREFORE is
// the writer asserting a complication or a consequence, and AND THEN is the
// wiki-timeline defect. An `insert` is the one edit that authors a NEW relation,
// so its connector is the one thing in a plan nobody else has already reviewed.
//
// EDIT_PLAN_SCHEMA asks for `connector` on an insert and does not require it —
// and on the local CLI the schema is a request, not a guarantee. The parser
// checked the op, the mark, the cards and the why, and passed the connector
// through untouched; `applyEdits` then filled a missing one with THEREFORE. So a
// model that never named the relation got a causal claim written for it, and a
// model that answered AND THEN (or any other word) got it spliced into the chain
// with the craft checks already stamped "not re-run".
//
// The trailer half of this step already refuses the same thing:
// `checkConnectors` reports an undeclared connector as `unmeasured`, "which is
// not the same as it being causal". This is the explainer half catching up.
// Reject-don't-repair, the parser's own rule: a default is a forced THEREFORE.
import { test, expect } from "@playwright/test";
import { applyEdits, parseEditPlan, PlanError, type Edit } from "@/app/_phases/script/editPlan";
import { RENDERS } from "@/app/_phases/script/renders";

const RID = "reversal-chain";
const render = RENDERS.find((r) => r.id === RID)!;
const AFTER = "0:35"; // "So what went wrong?" — a real mark in this render

const insert = (connector?: unknown) => ({
  renderId: RID,
  op: "insert",
  afterBeatAt: AFTER,
  seconds: 6,
  text: "Everyone expected the approvals to move the price.",
  label: "inserted",
  cards: ["f-ath"],
  why: "the note asked for the expectation to be stated",
  ...(connector === undefined ? {} : { connector }),
});
const plan = (e: object) =>
  JSON.stringify({ edits: [e], refusals: [], unchanged: [], summary: "one insert" });

/** Where the inserted beat lands, and what it claims about its predecessor. */
const landed = (e: Edit) => {
  const a = applyEdits(render, [e], {});
  const i = a.beats.findIndex((b) => b.label === "inserted");
  return a.beats[i].connector;
};

test("edit-plan-connector: the fixture still has the mark this probe inserts after", () => {
  expect(render.beats.map((b) => b.at)).toContain(AFTER);
});

for (const c of ["BUT", "THEREFORE"] as const) {
  test(`edit-plan-connector: an insert declaring ${c} parses and lands as ${c} — the check does not cry wolf`, () => {
    const p = parseEditPlan(plan(insert(c)));
    expect(landed(p.edits[0])).toBe(c);
  });
}

const refused: [string, unknown][] = [
  ["no connector at all", undefined],
  ["AND THEN", "AND THEN"],
  ["a word outside the alphabet", "SO"],
  ["the right word in the wrong case", "but"],
];

for (const [name, c] of refused) {
  test(`edit-plan-connector: an insert with ${name} is REJECTED, not defaulted`, () => {
    expect(() => parseEditPlan(plan(insert(c)))).toThrow(PlanError);
    expect(() => parseEditPlan(plan(insert(c)))).toThrow(/connector/);
  });
}

test("edit-plan-connector: applyEdits called directly asserts no relation nobody declared", () => {
  // The parser is the gate for model output; this is the belt for any other
  // caller. An undeclared relation stays undeclared — null, drawn as no chip —
  // rather than becoming THEREFORE on the way through.
  const e = insert() as unknown as Edit;
  expect(landed(e)).toBeNull();
});
