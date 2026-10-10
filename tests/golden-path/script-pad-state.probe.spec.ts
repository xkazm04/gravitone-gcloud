// LANE — THE NOTES PAD IS A PURE, NOTEBOOK-STAMPED STATE MACHINE (dynamic).
//
// The pad's three rules (feedback aggregates; one run at a time and no notes
// mid-flight; a candidate is not a baseline until accepted) used to live as six
// `if (running)` guards and a ref inside a "use client" hook this lane cannot
// execute. They are a transition table now (app/_phases/script/padState.ts),
// and the version ledger is stamped with the digest of the notebook it was
// written against, so a ledger from another notebook is HELD as an orphan the
// way the scope already is (research/useScope.ts orphanOf).

import { test, expect } from "@playwright/test";

import { padBasis, padInit, padRecordOf, padReduce, type PadAction, type PadState } from "@/app/_phases/script/padState";
import { SCRIPT_VERSIONS } from "@/app/_phases/script/records";
import { RecordRefusal } from "@/app/_phases/_shared/records/registry";
import { BASELINE, type Note, type Version } from "@/app/_phases/script/versions";
import { recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { renderPayloadFor } from "@/app/_phases/script/chainBase";
import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { fixtureSource } from "@/app/_phases/_shared/notebook/source";
import type { EditPlan } from "@/app/_phases/script/editPlan";

const ctx = () => ({ cards: buildCards(), scope: {} });
const n1: Note = { id: "n-c-descope-0", cardId: "c", kind: "descope", at: 0 };
const plan: EditPlan = {
  edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "1:45", why: "cut beat at 1:45" }],
  refusals: [],
  unchanged: [],
  summary: "cut 1:45",
};
const v2: Version = recalibrateFromPlan(BASELINE, [n1], plan, "v2", 1, ctx());

const at = (phase: PadState["phase"], over: Partial<PadState> = {}): PadState => ({
  ...padInit(),
  phase,
  notes: [n1],
  ...over,
});

test("case 1: rule 2 is one transition table — no write lands while a run is starting or live", () => {
  const writes: PadAction[] = [
    { type: "add-note", cardId: "c", kind: "descope" },
    { type: "remove-note", id: n1.id },
    { type: "clear-notes" },
    { type: "force-render", id: "reversal-chain" },
    { type: "force-conclusion", id: "c-1" },
  ];
  for (const phase of ["starting", "running"] as const) {
    const s = at(phase);
    for (const a of writes) expect(padReduce(s, a), `${a.type} changed the pad while ${phase}`).toBe(s);
  }
  // …and the same writes DO land on an idle pad.
  const idle = at("idle");
  for (const a of writes) expect(padReduce(idle, a), `${a.type} was refused on an idle pad`).not.toBe(idle);
});

test("case 2: a done turn stages a candidate on the baseline, exactly once", () => {
  const running = at("running");
  const land: PadAction = {
    type: "land",
    turn: { id: "tn-aaaaaaaaaaaa", status: "done", result: { plan } },
    at: 5,
    ctx: ctx(),
  };
  const once = padReduce(running, land);
  expect(once.phase).toBe("staged");
  expect(once.candidate?.basedOn).toBe(BASELINE.id);
  expect(once.consumed).toBe("tn-aaaaaaaaaaaa");
  expect(padReduce(once, land), "the same turn landed twice").toBe(once);
});

test("case 3: a failed turn stages the simulated fallback with the server's sentence; a cancelled one stages nothing", () => {
  const running = at("running");
  const failed = padReduce(running, {
    type: "land",
    turn: { id: "tn-bbbbbbbbbbbb", status: "failed", error: { message: "engine down" } },
    at: 5,
    ctx: ctx(),
  });
  expect(failed.phase).toBe("staged");
  expect(failed.candidate?.engine).toBe("simulated");
  expect(failed.engineNote).toBe("engine down");

  const cancelled = padReduce(running, {
    type: "land",
    turn: { id: "tn-cccccccccccc", status: "cancelled" },
    at: 5,
    ctx: ctx(),
  });
  expect(cancelled.phase).toBe("idle");
  expect(cancelled.candidate).toBeNull();
});

test("case 4: accepting moves the candidate onto the ledger, answers the notes and stamps the notebook", () => {
  const staged = at("staged", { candidate: v2, forceRenders: ["reversal-chain"], forceConclusions: ["c-1"] });
  const next = padReduce(staged, { type: "accept", digest: "D1" });
  expect(next.accepted).toHaveLength(staged.accepted.length + 1);
  expect(next.notes).toEqual([]);
  expect(next.forceRenders).toEqual([]);
  expect(next.forceConclusions).toEqual([]);
  expect(next.candidate).toBeNull();
  expect(padRecordOf(next).digest).toBe("D1");
});

test("case 5: a ledger written on another notebook is held as an orphan, never deleted", () => {
  const record = { accepted: [v2], notes: [n1], digest: "D1" };
  const frozen = JSON.stringify(record);
  const basis = padBasis(record, "D2");
  expect(basis).toEqual({ baseline: BASELINE, notes: [], orphan: { digest: "D1", accepted: 1, notes: 1 } });
  expect(JSON.stringify(record), "padBasis rewrote the stored record").toBe(frozen);
  // …and on its own notebook it is the ledger, unchanged.
  const own = padBasis(record, "D1");
  expect(own.orphan).toBeNull();
  expect(own.baseline).toBe(v2);
  expect(own.notes).toEqual([n1]);
});

test("case 6: an orphaned v2's beats are never sent beside another notebook", () => {
  const basis = padBasis({ accepted: [v2], notes: [n1], digest: "D1" }, "D2");
  expect(renderPayloadFor(basis.baseline)).toEqual(renderPayloadFor(BASELINE));
  expect(renderPayloadFor(v2)).not.toEqual(renderPayloadFor(BASELINE));
});

test("case 7 [guard]: a ledger stored before the stamp reads as the fixture's", () => {
  const legacy = { accepted: [v2], notes: [n1] };
  const basis = padBasis(legacy, fixtureSource().digest);
  expect(basis.orphan).toBeNull();
  expect(basis.baseline).toBe(v2);
});

test("case 8: the record's reader refuses a digest that is not text, and accepts none", () => {
  const bad = SCRIPT_VERSIONS.parse({ notes: [], accepted: [], digest: 7 });
  expect(bad).toBeInstanceOf(RecordRefusal);
  expect((bad as RecordRefusal).detail).toContain("script-versions.digest");
  expect(SCRIPT_VERSIONS.parse({ notes: [], accepted: [] })).not.toBeInstanceOf(RecordRefusal);
  expect(SCRIPT_VERSIONS.parse({ notes: [], accepted: [], digest: "D1" })).not.toBeInstanceOf(RecordRefusal);
});

test("case 10: a write on an orphaned pad starts this notebook's ledger instead of editing the other one", () => {
  const orphaned: PadState = { ...padInit(), accepted: [v2], notes: [n1], digest: "D1", dealt: "D2" };
  const next = padReduce(orphaned, { type: "add-note", cardId: "x", kind: "more-focus" });
  expect(next.accepted).toEqual([]);
  expect(next.notes.map((n) => n.cardId)).toEqual(["x"]);
  expect(padRecordOf(next).digest).toBe("D2");
});
