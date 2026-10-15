// THE DOJO DECISION ADAPTER (lib/decision/v1/sources/dojo.ts): v1's gate as a
// blind-pair packet. Arms are opaque, the judge's pick is a kernel machine
// pick, v1's own blind picks are imported, the claim is read off the picks by
// the stated rule, and the commit reaches v1 through patchBlind ->
// patchTrainingVerdicts -> commitCycle with v1's blind guard still standing.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-dojo-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { __setFoundryFsPort } from "../../lib/foundry/fsPort.ts";
import { armInSlotA, withBlindMap, type BlindState } from "../../lib/foundry/training/blind.ts";
import type { CycleManifest, Improvement, PairResult, TrainingLedgerRow, TrainingVerdicts } from "../../lib/foundry/training/types.ts";
import { armId, claimsOf, dojoAdapter, type DojoV1 } from "../../lib/decision/v1/sources/dojo.ts";
import { RecordingPort } from "../golden-path/_effects.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const CYCLE = "2026-10-14-rim";
const cycleDir = path.join(ROOT, "foundry-out", "training", CYCLE);
const catDir = path.join(ROOT, "catalogue");
const blobDir = path.join(ROOT, "blobs");

afterEach(() => __setFoundryFsPort(null));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const pair = (imp: string, id: string, judge: PairResult["judge_pick"]): PairResult => ({
  id,
  scene: `scene-${id}`,
  seed: 1,
  baseline: { file: `pairs/${imp}/${id}/baseline.png`, kind: "image" },
  challenger: { file: `pairs/${imp}/${id}/challenger.png`, kind: "image" },
  judge_pick: judge,
  reason: "r",
});
const imp = (id: string, pairs: PairResult[], over: Partial<Improvement> = {}): Improvement => ({ id, technique: `tech-${id}`, subject: "s", claim: `Is ${id} better lit?`, standard: "none", pairs, challenger_recipe: "c", baseline_recipe: "b", ...over });

const IMPS: Improvement[] = [
  imp("rim", ["p1", "p2", "p3", "p4"].map((p, i) => pair("rim", p, (["challenger", "challenger", "baseline", "tie"] as const)[i] ?? "tie")), { thumbnail: "pairs/rim/p1/challenger.png" }),
  imp("fog", [pair("fog", "q1", "baseline")]),
  imp("bare", []),
];

const manifest = (over: Partial<CycleManifest> = {}): CycleManifest => ({ version: 1, id: CYCLE, at: "2026-10-14T09:00:00.000Z", dimension: "lighting", subject: "portraits", status: "awaiting-gate", media: "image", improvements: IMPS, fail_streak: 0, log: [], ...over });

/** v1 already holds fog's claim (decided with the judges in view), and one blind pick on rim. */
const VERDICTS: TrainingVerdicts = { fog: "approve" };
const slotA = (p: string) => armInSlotA(CYCLE, "rim", p);
const BLIND: BlindState = { version: 1, map: {}, improvements: { rim: { picks: { p1: slotA("p1") === "challenger" ? "A" : "B" } } } };

function seed(cycle: CycleManifest = manifest()): void {
  rmSync(path.join(ROOT, "foundry-out"), { recursive: true, force: true });
  rmSync(catDir, { recursive: true, force: true });
  mkdirSync(catDir, { recursive: true });
  for (const i of cycle.improvements)
    for (const p of i.pairs)
      for (const r of [p.baseline, p.challenger]) {
        mkdirSync(path.dirname(path.join(cycleDir, r.file)), { recursive: true });
        writeFileSync(path.join(cycleDir, r.file), r.file);
      }
  writeFileSync(path.join(cycleDir, "cycle.json"), JSON.stringify(cycle));
  writeFileSync(path.join(cycleDir, "verdicts.json"), JSON.stringify(VERDICTS));
  writeFileSync(path.join(cycleDir, "blind.json"), JSON.stringify(BLIND));
}

const SHA = "e".repeat(64);
const literal = (): DojoV1 => ({
  cycle: manifest(),
  verdicts: VERDICTS,
  blind: withBlindMap(CYCLE, IMPS, BLIND),
  rev: 1,
  media: Object.fromEntries(IMPS.flatMap((i) => i.pairs.flatMap((p) => [p.baseline.file, p.challenger.file])).map((f) => [f, { sha256: SHA, bytes: 1, mime: "image/png" }])),
  picksAt: "2026-10-14T10:00:00.000Z",
});

const arm = (p: string, a: "baseline" | "challenger") => armId(CYCLE, "rim", p, a);

describe("dojo adapter - the packet (pure)", () => {
  it("asks the undecided improvement's pairs blind: opaque arms, the claim as the question, the judge as a hidden machine pick", () => {
    const plan = must(dojoAdapter.packet(literal()));
    expect(plan.packet.mode).toBe("blind-pair");
    expect(plan.packet.items.map((c) => c.row)).toEqual(["rim/p1", "rim/p1", "rim/p2", "rim/p2", "rim/p3", "rim/p3", "rim/p4", "rim/p4"]);
    // Nothing a browser holds names the arm: not the id, not a grade.
    for (const c of plan.packet.items) {
      expect(c.id).not.toMatch(/baseline|challenger/);
      expect(c.grades).toEqual([]);
    }
    expect(plan.present.questions?.["rim/p2"]).toBe("Is rim better lit?");
    // The judge picked the challenger on p1 and p2, the baseline on p3; its tie on p4 names no arm.
    expect(plan.machinePicks).toEqual([
      { row: "rim/p1", candidate: arm("p1", "challenger") },
      { row: "rim/p2", candidate: arm("p2", "challenger") },
      { row: "rim/p3", candidate: arm("p3", "baseline") },
    ]);
    expect(plan.losses).toEqual(
      expect.arrayContaining([expect.objectContaining({ candidate: "fog", grade: "dropped" }), expect.objectContaining({ candidate: "bare", grade: "dropped" })]),
    );
  });

  it("imports v1's blind pick through v1's own A/B map: the chosen arm kept, the other rejected", () => {
    const plan = must(dojoAdapter.packet(literal()));
    expect(plan.initial).toEqual([
      { candidate: arm("p1", "baseline"), verdict: "reject", reasons: [], by: "operator", surface: "v1", at: "2026-10-14T10:00:00.000Z" },
      { candidate: arm("p1", "challenger"), verdict: "keep", reasons: [], by: "operator", surface: "v1", at: "2026-10-14T10:00:00.000Z" },
    ]);
  });

  it("reads the claim off the picks: approve only when the challenger won more pairs than the baseline", () => {
    const d = (candidate: string, verdict: "keep" | "reject") => ({ key: `pkt:dojo:${CYCLE}::${candidate}`, verdict, reasons: [], rev: 1, by: "operator" as const, surface: "board", at: "2026-10-14T00:00:00.000Z" });
    const picks = (who: ("challenger" | "baseline" | "tie" | "both-bad")[]) =>
      ["p1", "p2", "p3", "p4"].flatMap((p, i) => {
        const w = who[i];
        return [d(arm(p, "baseline"), w === "baseline" || w === "tie" ? "keep" : "reject"), d(arm(p, "challenger"), w === "challenger" || w === "tie" ? "keep" : "reject")];
      });
    expect(claimsOf(literal(), picks(["challenger", "challenger", "baseline", "both-bad"]))[0]).toMatchObject({ verdict: "approve", challenger: 2, baseline: 1, bothBad: 1 });
    expect(claimsOf(literal(), picks(["challenger", "baseline", "tie", "tie"]))[0]?.verdict).toBe("reject");
    // An unpicked pair: no claim at all.
    expect(claimsOf(literal(), picks(["challenger", "challenger", "baseline", "both-bad"]).slice(0, 6))).toEqual([]);
  });
});

describe("dojo adapter - consequence and apply over a temp v1 store", () => {
  const operatorPicks = (flow: Awaited<ReturnType<typeof openFlow<DojoV1>>>) => {
    flow.patch([{ candidate: arm("p2", "challenger"), verdict: "keep" }, { candidate: arm("p2", "baseline"), verdict: "reject" }]);
    flow.patch([{ candidate: arm("p3", "baseline"), verdict: "keep" }, { candidate: arm("p3", "challenger"), verdict: "reject" }]);
    flow.pick("rim/p4", "both-bad");
  };

  it("names the claim's count before the commit, then writes the picks, the claim and v1's commit", async () => {
    seed();
    const flow = await openFlow(dojoAdapter, CYCLE, blobDir);
    operatorPicks(flow);
    const p = must(flow.preview());
    const rim = p.consequence.writes.find((w) => w.candidate === "rim" && w.target.endsWith("training-ledger.json"));
    expect(rim?.detail).toBe("tech-rim: approve → better · challenger chosen in 2 of 4 pair(s), baseline in 1, 1 both bad (written as tie)");
    expect(p.consequence.writes.find((w) => w.candidate === "fog")?.detail).toContain("as v1 recorded it");
    expect(p.consequence.deletes.map((x) => x.target)).toContain(`foundry-out/training/${CYCLE}/pairs/fog/q1/baseline.png`);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    const blind = JSON.parse(readFileSync(path.join(cycleDir, "blind.json"), "utf8")) as BlindState;
    const v1Of = (p: string, chose: "baseline" | "challenger") => (slotA(p) === chose ? "A" : "B");
    expect(blind.improvements["rim"]?.picks).toEqual({ p1: v1Of("p1", "challenger"), p2: v1Of("p2", "challenger"), p3: v1Of("p3", "baseline"), p4: "tie" });
    expect(JSON.parse(readFileSync(path.join(cycleDir, "verdicts.json"), "utf8"))).toEqual({ fog: "approve", rim: "approve" });
    const ledger = JSON.parse(readFileSync(path.join(catDir, "training-ledger.json"), "utf8")) as { rows: TrainingLedgerRow[] };
    expect(ledger.rows.map((r) => [r.technique, r.human, r.verdict, r.basis])).toEqual([
      ["tech-rim", "approve", "better", "blind"],
      ["tech-fog", "approve", "better", "anchored"],
    ]);
    expect(existsSync(path.join(catDir, "training", "thumbs", `${CYCLE}--rim.png`))).toBe(true);
    expect(existsSync(path.join(cycleDir, "pairs/rim/p2/baseline.png"))).toBe(false);
    expect((JSON.parse(readFileSync(path.join(cycleDir, "cycle.json"), "utf8")) as CycleManifest).status).toBe("committed");
  });

  it("v1's blind guard still stands: a claim whose pairs are not all picked is refused by v1, not anchored past", async () => {
    seed();
    const flow = await openFlow(dojoAdapter, CYCLE, blobDir);
    operatorPicks(flow);
    must(flow.commit());
    const claim = flow.claim();
    // The loop adds a fifth pair to rim after the packet was committed: rim is no longer fully picked.
    const grown = manifest({ improvements: IMPS.map((i) => (i.id === "rim" ? { ...i, pairs: [...i.pairs, pair("rim", "p5", "baseline")] } : i)) });
    writeFileSync(path.join(cycleDir, "cycle.json"), JSON.stringify(grown));
    const r = await dojoAdapter.apply(claim);
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["conflict", "Pick every pair blind (or skip blind) before deciding the claim: tech-rim."]);
    expect(JSON.parse(readFileSync(path.join(cycleDir, "verdicts.json"), "utf8"))).toEqual({ fog: "approve" });
  });

  it("a second delivery is a no-op, a different v1 claim is refused, and every crash prefix recovers", async () => {
    seed();
    const flow = await openFlow(dojoAdapter, CYCLE, blobDir);
    operatorPicks(flow);
    must(flow.commit());
    const claim = flow.claim();
    const clean = new RecordingPort();
    __setFoundryFsPort(clean);
    must(await dojoAdapter.apply(claim));
    __setFoundryFsPort(null);
    const snapshot = () => {
      const strip = (s: string) => s.replace(/"at":\s*"[^"]*"/g, '"at":""').replace(/"_rev":\s*\d+/g, '"_rev":0').replace(/Committed \d{4}-\d\d-\d\dT[\d:.]+Z\./, "Committed.");
      return [path.join(catDir, "training-ledger.json"), path.join(cycleDir, "blind.json"), path.join(cycleDir, "verdicts.json"), path.join(cycleDir, "cycle.json"), path.join(cycleDir, "findings.md")].map((f) => strip(readFileSync(f, "utf8")));
    };
    const want = snapshot();
    must(await dojoAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    for (let k = 1; k <= clean.applied; k++) {
      seed();
      __setFoundryFsPort(new RecordingPort({ crashAt: k }));
      expect((await dojoAdapter.apply(claim)).ok, `crash at ${k}`).toBe(false);
      __setFoundryFsPort(null);
      must(await dojoAdapter.apply(claim));
      expect(snapshot(), `retry after a crash at mutation ${k}`).toEqual(want);
    }
    writeFileSync(path.join(cycleDir, "verdicts.json"), JSON.stringify({ fog: "approve", rim: "reject" }));
    const r = await dojoAdapter.apply(claim);
    expect(r.ok ? "" : r.error.message).toContain("tech-rim is reject in v1, approve here");
  }, 30_000); // every crash prefix replays a commit: slow under a full parallel run
});

describe("dojo adapter - a cycle every claim of which was made in v1 (wave B ruling 3)", () => {
  /** rim and fog decided in v1, with no blind pick at all (anchored: v1's gate let a claim skip blind). */
  function seedDecided(verdicts: TrainingVerdicts): void {
    seed();
    writeFileSync(path.join(cycleDir, "verdicts.json"), JSON.stringify(verdicts));
    writeFileSync(path.join(cycleDir, "blind.json"), JSON.stringify({ version: 1, map: {}, improvements: {} }));
  }

  it("still opens: a packet review of the decided improvements, v1's claims as its decisions, the undecided disclosed", async () => {
    seedDecided({ rim: "approve", fog: "reject" });
    const flow = await openFlow(dojoAdapter, CYCLE, blobDir);
    expect(flow.plan.packet.mode).toBe("packet-review");
    expect(flow.plan.packet.items.map((c) => c.id)).toEqual(["rim", "fog"]);
    expect(flow.plan.initial.map((d) => [d.candidate, d.verdict])).toEqual([["rim", "keep"], ["fog", "reject"]]);
    expect(flow.plan.losses).toEqual(expect.arrayContaining([expect.objectContaining({ candidate: "bare", grade: "dropped" })]));
    // rim is reviewed by its thumbnail; fog has none and shows its challenger arm.
    expect(flow.plan.urls["rim"]).toContain(encodeURIComponent("pairs/rim/p1/challenger.png"));
    expect(flow.plan.urls["fog"]).toContain(encodeURIComponent("pairs/fog/q1/challenger.png"));
  }, 30_000); // opens over a full temp v1 store: slow under a full parallel run

  it("commits as v1 recorded it, through commitCycle; overturning an unpicked claim is v1's refusal, at the preview", async () => {
    seedDecided({ rim: "approve", fog: "reject" });
    const flow = await openFlow(dojoAdapter, CYCLE, blobDir);
    flow.patch([{ candidate: "fog", verdict: "keep" }]);
    const refused = flow.preview();
    expect(refused.ok ? "" : refused.error.message).toBe("Pick every pair blind (or skip blind) before deciding the claim: tech-fog.");
    flow.patch([{ candidate: "fog", verdict: "reject" }]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 1, rejected: 1, undecided: 0 });
    expect(p.consequence.writes.find((w) => w.candidate === "fog")?.detail).toContain("as v1 recorded it");
    must(flow.commit());
    const claim = flow.claim();
    must(await dojoAdapter.apply(claim));
    const cycle = JSON.parse(readFileSync(path.join(cycleDir, "cycle.json"), "utf8")) as CycleManifest;
    expect(cycle.status).toBe("committed");
    expect(JSON.parse(readFileSync(path.join(cycleDir, "verdicts.json"), "utf8"))).toMatchObject({ rim: "approve", fog: "reject" });
    // A second delivery of the same outcome is a no-op on the committed cycle.
    must(await dojoAdapter.apply(claim));
  });
});
