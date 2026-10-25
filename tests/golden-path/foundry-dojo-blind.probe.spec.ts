// LANE — THE DOJO'S BLIND GATE (dynamic).
//
// lib/foundry/training/blind.ts is the pure half (A/B map, agreement math,
// ledger verdict); store.ts wires it to blind.json and the commit.
//
// 1. blindMap for a cycle is deterministic and independent of the judge's pick.
// 2. The blind-phase pair view carries neither arm names nor the judge's reason.
// 3. A claim verdict cannot be saved while a pair is unpicked, unless anchored.
// 4. human {p1:A->challenger, p2:B->baseline} vs judge {challenger, challenger}
//    -> chokepoint_vs_human 0.5, human_pick_rate 0.5 on the ledger row.
// 5. pairs_n = 2 (< floor 4) with no override -> ledger verdict `unmeasurable`.
// 6. An old verdicts.json (one string per improvement, no blind.json) still commits.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { BLIND_FLOOR, armInSlotA, blindPairView, buildBlindMap, measureBlind, pickToArm } from "@/lib/foundry/training/blind";
import { commitCycle, getCycle, patchBlind, patchTrainingVerdicts } from "@/lib/foundry/training/store";
import type { CycleManifest, PairResult } from "@/lib/foundry/training/types";

import { probeFoundryDir, probeTrainingDir } from "./_helpers";

const foundryDir = probeFoundryDir();
const trainingDir = probeTrainingDir();

const pair = (id: string, judge: PairResult["judge_pick"]): PairResult => ({
  id,
  scene: `scene-${id}`,
  seed: 1,
  baseline: { file: `pairs/imp-1/${id}-baseline.png`, kind: "image" },
  challenger: { file: `pairs/imp-1/${id}-challenger.png`, kind: "image" },
  judge_pick: judge,
  reason: `reason-${id}`,
});

function setup(id: string, pairs: PairResult[], verdicts: Record<string, string> = {}) {
  const dir = path.join(trainingDir(), id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "pairs", "imp-1"), { recursive: true });
  for (const p of pairs) for (const f of [p.baseline.file, p.challenger.file]) writeFileSync(path.join(dir, f), "x", "utf8");
  const cycle: CycleManifest = {
    version: 1,
    id,
    at: new Date().toISOString(),
    dimension: "camera",
    subject: "portrait",
    status: "awaiting-gate",
    media: "image",
    fail_streak: 0,
    log: [],
    improvements: [
      {
        id: "imp-1",
        technique: "low-angle",
        subject: "portrait",
        claim: "better depth",
        standard: "none",
        challenger_recipe: "c",
        baseline_recipe: "b",
        pairs,
      },
    ],
  };
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify(cycle), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return { dir, cycle };
}

const ledgerRows = (): { cycle: string; verdict: string; human_pick_rate?: number; pairs_n?: number; basis?: string; judge_agreement?: { chokepoint_vs_human: number } }[] =>
  JSON.parse(readFileSync(path.join(foundryDir(), "training-ledger.json"), "utf8")).rows;

test("blindMap is deterministic and independent of the judge's pick", async () => {
  const a = buildBlindMap("cyc-1", setup("probe-blind-map-a", [pair("p1", "challenger"), pair("p2", "baseline")]).cycle.improvements);
  const b = buildBlindMap("cyc-1", setup("probe-blind-map-b", [pair("p1", "baseline"), pair("p2", "challenger")]).cycle.improvements);
  rmSync(path.join(trainingDir(), "probe-blind-map-a"), { recursive: true, force: true });
  rmSync(path.join(trainingDir(), "probe-blind-map-b"), { recursive: true, force: true });
  expect(a).toEqual(b);
  expect(a["imp-1/p1"]).toBe(armInSlotA("cyc-1", "imp-1", "p1"));
  // Across many pairs both slots are used, so the shuffle is a shuffle.
  const arms = new Set(Array.from({ length: 40 }, (_, i) => armInSlotA("cyc-1", "imp-1", `p${i}`)));
  expect(arms.size).toBe(2);
});

test("the blind view model holds neither arm names nor the judge's reason", async () => {
  const p = pair("p1", "challenger");
  p.gemini_pick = "baseline";
  p.gemini_reason = "gem-reason";
  for (const slotA of ["baseline", "challenger"] as const) {
    const view = blindPairView(p, slotA);
    expect(Object.keys(view).sort()).toEqual(["a", "b", "id", "scene"]);
    expect(JSON.stringify(view)).not.toMatch(/reason|judge|gemini|pick/i);
  }
});

test("a claim verdict is refused while a pair is unpicked, and allowed once picked or anchored", async () => {
  const id = `probe-blind-guard-${Date.now().toString(36)}`;
  const { dir } = setup(id, [pair("p1", "challenger"), pair("p2", "challenger")]);
  try {
    await expect(patchTrainingVerdicts(id, { baseRev: 0, set: { "imp-1": "approve" }, surface: "foundry" })).rejects.toThrow(/blind/i);
    await patchBlind(id, [{ imp: "imp-1", pair: "p1", pick: "A" }]);
    await expect(patchTrainingVerdicts(id, { baseRev: 0, set: { "imp-1": "approve" }, surface: "foundry" })).rejects.toThrow(/blind/i);
    await patchBlind(id, [{ imp: "imp-1", pair: "p2", pick: "tie" }]);
    const ok = await patchTrainingVerdicts(id, { baseRev: 0, set: { "imp-1": "approve" }, surface: "foundry" });
    expect(ok.verdicts["imp-1"]).toBe("approve");

    // Skip blind: a fresh cycle, claim saved with nothing picked.
    const id2 = `${id}-anchored`;
    setup(id2, [pair("p1", "challenger")]);
    await patchBlind(id2, [{ imp: "imp-1", anchored: true }]);
    await patchTrainingVerdicts(id2, { baseRev: 0, set: { "imp-1": "reject" }, surface: "foundry" });
    expect((await getCycle(id2)).blind.improvements["imp-1"].anchored).toBe(true);
    rmSync(path.join(trainingDir(), id2), { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the ledger row carries the blind measurement: A->challenger, B->baseline vs judge challenger twice", async () => {
  const id = `probe-blind-measure-${Date.now().toString(36)}`;
  const { dir, cycle } = setup(id, [pair("p1", "challenger"), pair("p2", "challenger")], { "imp-1": "approve" });
  try {
    const map = buildBlindMap(id, cycle.improvements);
    // Choose picks that mean {p1: challenger, p2: baseline} whatever the shuffle gave.
    const pickFor = (p: string, want: "baseline" | "challenger") => (pickToArm("A", map[`imp-1/${p}`]) === want ? "A" : "B") as "A" | "B";
    const picks = { p1: pickFor("p1", "challenger"), p2: pickFor("p2", "baseline") };
    const m = measureBlind(cycle.improvements[0], { picks }, map);
    expect(m).toMatchObject({ pairs_n: 2, human_pick_rate: 0.5, chokepoint_vs_human: 0.5 });

    await patchBlind(id, [
      { imp: "imp-1", pair: "p1", pick: picks.p1 },
      { imp: "imp-1", pair: "p2", pick: picks.p2 },
    ]);
    await commitCycle(id);
    const row = ledgerRows().find((r) => r.cycle === id)!;
    expect(row.human_pick_rate).toBe(0.5);
    expect(row.pairs_n).toBe(2);
    expect(row.judge_agreement?.chokepoint_vs_human).toBe(0.5);
    expect(row.basis).toBe("blind");
    // pairs_n 2 < floor, no override.
    expect(BLIND_FLOOR).toBe(4);
    expect(row.verdict).toBe("unmeasurable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit override lets a below-floor row keep the human's verdict", async () => {
  const id = `probe-blind-override-${Date.now().toString(36)}`;
  const { dir } = setup(id, [pair("p1", "challenger")], { "imp-1": "approve" });
  try {
    await patchBlind(id, [{ imp: "imp-1", pair: "p1", pick: "A" }, { imp: "imp-1", floorOverride: true }]);
    await commitCycle(id);
    expect(ledgerRows().find((r) => r.cycle === id)!.verdict).toBe("better");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an old verdicts.json with no blind.json still commits, recorded as anchored", async () => {
  const id = `probe-blind-legacy-${Date.now().toString(36)}`;
  const { dir } = setup(id, [pair("p1", "challenger")], { "imp-1": "reject" });
  try {
    expect((await getCycle(id)).verdicts["imp-1"]).toBe("reject");
    await commitCycle(id);
    const row = ledgerRows().find((r) => r.cycle === id)!;
    expect(row.verdict).toBe("not-better");
    expect(row.basis).toBe("anchored");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
