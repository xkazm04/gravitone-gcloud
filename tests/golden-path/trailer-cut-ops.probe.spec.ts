// LANE — THE TRAILER CUT AS AN EDIT LOG (lib/script/trailer/ops.ts), pure.
//
// The cut is stored as the dealt origin plus an ordered log of typed ops, and the
// snapshot is derived by replay. These cases pin the properties that make undo
// free and a recompose a rebase rather than a discard, over the Glass Harbor
// fixture (the same composed cut the lifecycle probe seeds).
import { test, expect } from "@playwright/test";

import { slotsFor } from "@/lib/research/beats";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/lib/studio/trailerFixtures";
import { composeCut, addPromise, withBeat, withPromisePayer, withAllowance } from "@/lib/script/trailer/cut";
import {
  canRedo,
  canUndo,
  derive,
  edited,
  editAddPromise,
  editAllowance,
  editBeat,
  editPayer,
  inverseOf,
  logFromRecord,
  newLog,
  rebase,
  redo,
  replay,
  resetBeat,
  undo,
  type CutLog,
} from "@/lib/script/trailer/ops";

const slots = slotsFor("trailer");
const picks = Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id]));
const compose = (p: Record<string, string>) =>
  composeCut({ projectId: "p-ops", title: "Glass Harbor — trailer", picks: p, slots, cue: GLASS_HARBOR_CUE });
const origin = compose(picks);
const fresh = (): CutLog => newLog(origin, GLASS_HARBOR_BUDGET);

test("replay with no ops is the origin, and replay equals applying the updaters in sequence", () => {
  expect(replay(origin, []).cut).toBe(origin);

  const [b0, b1] = origin.beats;
  const rungWithPromise = origin.beats.find((b) => (b.promises ?? []).length > 0) ?? b1;
  const promiseId = rungWithPromise.promises?.[0]?.id;
  const asset = GLASS_HARBOR_BUDGET.assets[0];

  let log = fresh();
  log = editBeat(log, b0.id, { label: "L0", text: "T0" });
  log = editBeat(log, b1.id, { connector: "BUT" });
  log = editAddPromise(log, b1.id, "a new claim");
  if (promiseId) log = editPayer(log, rungWithPromise.id, promiseId, "the heist crew");
  log = editAllowance(log, asset.id, "spend", "earned by the reset");

  let cut = withBeat(origin, b0.id, { label: "L0", text: "T0" });
  cut = withBeat(cut, b1.id, { connector: "BUT" });
  cut = addPromise(cut, b1.id, "a new claim");
  if (promiseId) cut = withPromisePayer(cut, rungWithPromise.id, promiseId, "the heist crew");
  const budget = withAllowance(GLASS_HARBOR_BUDGET, asset.id, "spend", "earned by the reset");

  const d = derive(log);
  expect(d.cut).toEqual(cut);
  expect(d.budget).toEqual(budget);
  expect(replay(origin, log.ops, GLASS_HARBOR_BUDGET).skipped).toEqual([]);
});

test("undo restores the prior text/connector exactly, redo reapplies, a new edit truncates the redo tail", () => {
  const b = origin.beats[1];
  let log = editBeat(fresh(), b.id, { text: "rewritten", connector: "THEREFORE" });
  expect(derive(log).cut.beats[1].text).toBe("rewritten");
  expect(canUndo(log)).toBe(true);

  log = undo(log);
  expect(derive(log).cut).toEqual(origin);
  expect(derive(log).cut.beats[1].text).toBe(b.text);
  expect(derive(log).cut.beats[1].connector).toBe(b.connector);
  expect(canRedo(log)).toBe(true);

  log = redo(log);
  expect(derive(log).cut.beats[1].text).toBe("rewritten");
  expect(derive(log).cut.beats[1].connector).toBe("THEREFORE");

  log = undo(log);
  log = editBeat(log, b.id, { text: "a different rewrite" });
  expect(canRedo(log), "a new edit after an undo truncates the redo tail").toBe(false);
  expect(log.ops.length).toBe(1);
});

test("every op's inverse undoes it", () => {
  const b = origin.beats[1];
  let log = editBeat(fresh(), b.id, { text: "x" });
  log = editAddPromise(log, b.id, "claim");
  log = editAllowance(log, GLASS_HARBOR_BUDGET.assets[0].id, "spend", "why");
  let cut = origin;
  let budget = GLASS_HARBOR_BUDGET;
  for (const op of log.ops) {
    const r = replay(cut, [op], budget);
    cut = r.cut;
    budget = r.budget!;
  }
  for (const op of [...log.ops].reverse()) {
    const r = replay(cut, [inverseOf(op)], budget);
    cut = r.cut;
    budget = r.budget!;
  }
  expect(cut).toEqual(origin);
  expect(budget).toEqual(GLASS_HARBOR_BUDGET);
});

test("recompose is a rebase: edits on unchanged slots survive, edits on the changed slot are skipped with their beat ids", () => {
  const moved = slots.find((s) => s.variants.length > 1)!;
  expect(moved, "the fixture needs a slot with two variants").toBeTruthy();
  const movedBeatId = moved.variants[0].beat.id;
  const other = origin.beats.find((b) => b.id !== movedBeatId)!;

  let log = fresh();
  log = editBeat(log, other.id, { text: "survives" });
  log = editBeat(log, movedBeatId, { text: "does not carry" });
  log = editAllowance(log, GLASS_HARBOR_BUDGET.assets[0].id, "spend", "kept");

  const next = compose({ ...picks, [moved.id]: moved.variants[1].id });
  const r = rebase(log, next);

  expect(r.skipped.map((o) => (o.kind === "patch-beat" ? o.beatId : null))).toEqual([movedBeatId]);
  const d = derive(r.log);
  expect(d.cut.beats.find((b) => b.id === other.id)!.text).toBe("survives");
  expect(d.cut.beats.some((b) => b.id === movedBeatId)).toBe(false);
  expect(d.budget.assets[0].allowance, "the budget is the campaign's and is kept").toBe("spend");
  expect(r.log.origin).toBe(next);
});

test("legacy record (cut, no origin/ops) is its own origin with an empty log", () => {
  const edited1 = withBeat(origin, origin.beats[0].id, { label: "AN EDIT NOBODY MAY DISCARD" });
  const log = logFromRecord({ cut: edited1, budget: GLASS_HARBOR_BUDGET });
  expect(log.ops).toEqual([]);
  expect(derive(log).cut).toEqual(edited1);
  // The new shape round-trips.
  const again = logFromRecord({ cut: derive(editBeat(log, origin.beats[1].id, { text: "t" })).cut, budget: GLASS_HARBOR_BUDGET, origin: log.origin, originBudget: log.originBudget, ops: editBeat(log, origin.beats[1].id, { text: "t" }).ops, head: 1 });
  expect(again.ops.length).toBe(1);
});

test("twenty keystrokes in one focus are one op; a new focus is a new op", () => {
  const b = origin.beats[0];
  let log = fresh();
  let text = b.text;
  for (let i = 0; i < 20; i++) {
    text += "x";
    log = editBeat(log, b.id, { text }, "focus-1");
  }
  expect(log.ops.length).toBe(1);
  log = undo(log);
  expect(derive(log).cut.beats[0].text, "one undo reverts the whole gesture").toBe(b.text);
  log = redo(log);
  log = editBeat(log, b.id, { text: text + "!" }, "focus-2");
  expect(log.ops.length).toBe(2);
});

test("edited() and resetBeat() speak for one beat only", () => {
  const [a, b] = origin.beats;
  let log = editBeat(fresh(), a.id, { text: "A" });
  log = editBeat(log, b.id, { text: "B" });
  expect(edited(log, a.id)).toBe(true);
  expect(edited(log, origin.beats[2].id)).toBe(false);
  log = resetBeat(log, a.id);
  expect(edited(log, a.id)).toBe(false);
  expect(derive(log).cut.beats[0].text).toBe(a.text);
  expect(derive(log).cut.beats[1].text).toBe("B");
  expect(log.head).toBe(1);
});
