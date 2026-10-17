// LANE — THE VERSION HISTORY IS WALKABLE (dynamic).
//
// Two holes in the one loop of the script step that costs money:
//   · a recalibration staged but not yet accepted vanished on reload — the pad
//     persisted only a "lost" receipt, and the turn it came from was already
//     marked consumed, so the paid answer was unreachable;
//   · accepting was one-way — once v3 was the baseline nothing led back to v2.
//
// app/_phases/script/history.ts answers both, forward-only: a staged run is
// stored against the baseline (and notebook) it was built on and resumed only
// if neither moved; restoring vN mints a NEW version staged as a candidate, so
// it passes the same gate and accept/override path as a run, and nothing is
// ever truncated. v1's pad reducer (padState.ts), its record def and the surfaces
// that drew it retired with the studio (Phase 4 wave D); the script part keeps the
// ledger in a kernel part record whose door drops only a damaged staged version
// (packages/kernel/test/parts.test.ts).

import { test, expect } from "@playwright/test";

import { acceptInto, restoreAs, resumeStaged, stagedOf } from "@/lib/script/history";
import { BASELINE, engineRunWith, receiptOf, type Note, type Version } from "@/lib/script/versions";
import { IMPACT } from "@/lib/script/impact";
import { recalibrate, recalibrateFromPlan } from "@/lib/script/recalibrate";
import { chainOf } from "@/lib/script/chainBase";
import { buildCards } from "@/lib/notebook/cards";
import type { EditPlan } from "@/lib/script/editPlan";

const ctx = () => ({ cards: buildCards(), scope: {} });
const note = (cardId: string, kind: Note["kind"], at: number): Note => ({ id: `n-${cardId}-${kind}-${at}`, cardId, kind, at });
const plan: EditPlan = {
  edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "1:45", why: "cut beat at 1:45" }],
  refusals: [],
  summary: "cut 1:45",
};
const engineRun = engineRunWith(
  { kind: "local-claude-code", model: "claude-opus-5", costUsd: 0.41, durationMs: 200_000, promptChars: 40_000 },
  { blocks: [{ name: "notebook", chars: 30_000 }], totalChars: 30_000, ceilingChars: 120_000 },
);
const override = { at: 5, violations: 2, blocking: ["reversal-chain"], enforced: 40 };

const v2: Version = {
  ...recalibrateFromPlan(BASELINE, [note("c", "descope", 0)], plan, "v2", 1, ctx()),
  engineRun,
  override,
};
const v3: Version = recalibrate(v2, [note("d", "more-focus", 1)], "v3", 2, ctx());
const v4: Version = recalibrate(v3, [note("e", "less-focus", 2)], "v4", 3, ctx());

const omit = <T extends object>(o: T, keys: (keyof T)[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k as keyof T)));

test("case 1: restoreAs mints a forward version carrying everything of v2 but its run and its override", () => {
  expect(v2.beats, "fixture: v2 must be a model version with beats").toBeTruthy();
  const r = restoreAs(v2, v4, "v5", 9)!;
  expect(r).toEqual({
    ...omit(v2, ["engineRun", "override"]),
    id: "v5",
    label: r.label,
    basedOn: "v4",
    restoredFrom: "v2",
    notes: [],
    createdAt: 9,
  });
  expect(r.label, "a restore must not borrow v2's name").not.toBe(v2.label);
  expect(r.engineRun).toBeUndefined();
  expect(r.override).toBeUndefined();
  // Budget drives the Coverage overrun tally: a partial copy fails here.
  expect(r.budget).toEqual(v2.budget);
  expect(r.refusals).toEqual(v2.refusals);
});

test("case 2: restoring the original renders mints a forward version — it does not rewind", () => {
  const r = restoreAs(BASELINE, v3, "v4", 9)!;
  expect(r.beats).toBeUndefined();
  expect(r.impact).toEqual(IMPACT);
  expect(r.basedOn).toBe("v3");
  expect(r.restoredFrom).toBe(BASELINE.id);
  expect(chainOf(r, "reversal-chain")).toEqual(chainOf(BASELINE, "reversal-chain"));
});

test("case 3: the current baseline cannot be restored onto itself", () => {
  expect(restoreAs(v4, v4, "v5", 9)).toBeNull();
});

test("case 4: a restored version's receipt says so — not the simulated-fallback line", () => {
  const line = receiptOf(restoreAs(v2, v4, "v5", 9)!);
  expect(line).toBe("restored from v2 · no model call");
  expect(line).not.toContain("simulated");
});

test("case 6: a staged run whose baseline moved, or that is damaged, is reported lost with its reason", () => {
  const candidate = recalibrate(v3, [note("f", "descope", 4)], "v4", 7, ctx());
  const moved = resumeStaged(stagedOf(candidate, "v3"), { baselineId: "v4" });
  expect(moved).toMatchObject({ lost: "baseline-moved", label: candidate.label, notes: 1 });
  expect(resumeStaged({ baselineId: "v3", candidate: { id: 4 } }, { baselineId: "v3" })).toMatchObject({ lost: "unreadable" });
  expect(resumeStaged("nonsense", { baselineId: "v3" })).toMatchObject({ lost: "unreadable" });
  // A staged run built on another notebook is not resumed onto this one.
  expect(resumeStaged(stagedOf(candidate, "v3", "D1"), { baselineId: "v3", digest: "D2" })).toMatchObject({
    lost: "notebook-moved",
  });
});

test("case 7: history only grows — accepting a restore appends it and truncates nothing", () => {
  const out = acceptInto([v2, v3], restoreAs(v2, v3, "v4", 9)!);
  expect(out.map((v) => v.id)).toEqual(["v2", "v3", "v4"]);
  expect(out[2].restoredFrom).toBe("v2");
  // The override receipt on the earlier version is untouched.
  expect(out[0].override).toEqual(override);
});

