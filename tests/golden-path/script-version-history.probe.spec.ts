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
// ever truncated. The reducer (padState.ts) carries both transitions.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";
import { acceptInto, restoreAs, resumeStaged, stagedOf } from "@/app/_phases/script/history";
import { padInit, padRecordOf, padReduce, type PadState } from "@/app/_phases/script/padState";
import { SCRIPT_VERSIONS, type ScriptVersionsData } from "@/app/_phases/script/records";
import { RecordRefusal } from "@/app/_phases/_shared/records/registry";
import { BASELINE, engineRunWith, receiptOf, type Note, type Version } from "@/app/_phases/script/versions";
import { IMPACT } from "@/app/_phases/script/impact";
import { recalibrate, recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { chainOf } from "@/app/_phases/script/chainBase";
import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import type { EditPlan } from "@/app/_phases/script/editPlan";

const ctx = () => ({ cards: buildCards(), scope: {} });
const note = (cardId: string, kind: Note["kind"], at: number): Note => ({ id: `n-${cardId}-${kind}-${at}`, cardId, kind, at });
const plan: EditPlan = {
  edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "1:45", why: "cut beat at 1:45" }],
  refusals: [],
  unchanged: [],
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

test("case 5: a staged run round-trips through the record and resumes whole, engineRun and manifest included", () => {
  const candidate: Version = {
    ...recalibrateFromPlan(v3, [note("f", "descope", 4)], plan, "v4", 7, ctx()),
    engineRun,
  };
  const stored = JSON.parse(JSON.stringify({ notes: [], accepted: [v2, v3], staged: stagedOf(candidate, "v3") }));
  const parsed = SCRIPT_VERSIONS.parse(stored);
  expect(parsed).not.toBeInstanceOf(RecordRefusal);
  const back = resumeStaged((parsed as ScriptVersionsData).staged, { baselineId: "v3" });
  expect(back).toEqual(candidate);
  expect((back as Version).engineRun?.manifest).toEqual(engineRun!.manifest);
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

test("case 6 [guard]: a damaged staged entry never costs the record its accepted versions", () => {
  const parsed = SCRIPT_VERSIONS.parse({ notes: [], accepted: [v2, v3], staged: { candidate: "junk" } });
  expect(parsed).not.toBeInstanceOf(RecordRefusal);
  expect((parsed as ScriptVersionsData).accepted.map((v) => v.id)).toEqual(["v2", "v3"]);
});

test("case 7: history only grows — accepting a restore appends it and truncates nothing", () => {
  const out = acceptInto([v2, v3], restoreAs(v2, v3, "v4", 9)!);
  expect(out.map((v) => v.id)).toEqual(["v2", "v3", "v4"]);
  expect(out[2].restoredFrom).toBe("v2");
  // The override receipt on the earlier version is untouched.
  expect(out[0].override).toEqual(override);
});

// ── the reducer carries it ───────────────────────────────────────────────────

const pad = (over: Partial<PadState> = {}): PadState => ({ ...padInit(), accepted: [v2, v3], digest: "D1", dealt: "D1", ...over });

test("case 8: restore is a pad transition — staged from idle, refused while a run is live or a candidate is staged", () => {
  const n = note("x", "custom", 0);
  const idle = pad({ notes: [n], seq: 1 });
  const next = padReduce(idle, { type: "restore", id: "v2", at: 9 });
  expect(next.phase).toBe("staged");
  expect(next.candidate).toMatchObject({ id: "v4", basedOn: "v3", restoredFrom: "v2" });
  expect(next.accepted, "a restore is not a baseline until accepted").toBe(idle.accepted);

  for (const phase of ["starting", "running"] as const) {
    const s = pad({ phase });
    expect(padReduce(s, { type: "restore", id: "v2", at: 9 }), `restore ran while ${phase}`).toBe(s);
  }
  const staged = pad({ phase: "staged", candidate: v4 });
  expect(padReduce(staged, { type: "restore", id: "v2", at: 9 }), "a restore threw away a staged run").toBe(staged);
  expect(padReduce(idle, { type: "restore", id: "v3", at: 9 }), "the baseline restored onto itself").toBe(idle);
  expect(padReduce(idle, { type: "restore", id: "nope", at: 9 })).toBe(idle);

  // Accepting a restore appends it, and does not wipe notes it was not made from.
  const accepted = padReduce(next, { type: "accept", digest: "D1" });
  expect(accepted.accepted.map((v) => v.id)).toEqual(["v2", "v3", "v4"]);
  expect(accepted.notes).toEqual([n]);
});

test("case 9: a staged run is saved whole and a reload resumes it; a moved baseline reloads as lost, with why", () => {
  const candidate = recalibrate(v3, [note("f", "descope", 4)], "v4", 7, ctx());
  const saved = JSON.parse(JSON.stringify(padRecordOf(pad({ phase: "staged", candidate, consumed: "t-1" }))));
  const back = padReduce({ ...padInit(), dealt: "D1" }, { type: "hydrate", record: saved });
  expect(back.phase).toBe("staged");
  expect(back.candidate).toEqual(candidate);
  expect(back.lost).toBeNull();
  expect(back.consumed).toBe("t-1");

  const moved = padReduce({ ...padInit(), dealt: "D1" }, { type: "hydrate", record: { ...saved, accepted: [v2] } });
  expect(moved.candidate).toBeNull();
  expect(moved.lost).toMatchObject({ lost: "baseline-moved", label: candidate.label });
});

test("case 10: the live surfaces use it — the hook, the reducer, the bar and the lost line", () => {
  const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));
  const hook = read("app/_phases/script/useVersions.ts");
  expect(hook, "useVersions exposes no restore").toMatch(/type:\s*"restore"/);
  expect(hook).toMatch(/\brestore,/);
  const reducer = read("app/_phases/script/padState.ts");
  expect(reducer, "the save does not write the staged run").toMatch(/stagedOf\(/);
  expect(reducer, "the load does not resume the staged run").toMatch(/resumeStaged\(/);
  expect(reducer, "accept does not go through acceptInto").toMatch(/acceptInto\(/);
  expect(reducer, "restore does not go through restoreAs").toMatch(/restoreAs\(/);
  expect(read("app/_phases/script/_matrix/VersionBar.tsx"), "the bar offers no restore").toMatch(/api\.restore\(/);
  expect(read("app/_phases/script/_notes/RecalibrateControl.tsx"), "the lost line gives no reason").toMatch(
    /lostCandidate\.lost/,
  );
});
