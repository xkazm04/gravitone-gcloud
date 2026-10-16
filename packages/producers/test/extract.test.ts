import { describe, expect, it } from "vitest";
import { parseAt } from "@gt/domain/door";
import { jobSchema, type Job } from "@gt/domain/job";
import { classify, entriesOf, planOf } from "../src/extract/define.ts";
import { DEFAULT_CALL_ESTIMATE_USD, doneUnits, next, settleReason, stepName, totalUnits, unitEstimate, usableFix, type ManifestView, type RoundView, type StyleView, type Unit } from "../src/extract/units.ts";

// The extract definition's pure half on literal manifests: the unit order the
// job's plan follows, the names a booked unit keeps across retries, the four
// settle reasons, the classification of what a unit did (a vendor failure is
// the breaker's, a money stop never is), and what one served call books.

const FIX = "a recipe fix long enough to be a recipe: flat cel shading, hard rim light, teal-orange palette";
const opts = { rounds: 2, replicas: 2, transfers: 1, target: 0.85, grouping: "engine" as const };
const src = (id: string, read = true, error: string | null = null) => ({ id, readback: read ? {} : null, error });
const round = (o: Partial<RoundView> = {}): RoundView => ({ file: "f.jpg", error: null, score: 0.5, recipe: "r", critique: { recipe_fix: FIX }, ...o });
const style = (id: string, members: string[], o: Partial<StyleView> = {}): StyleView => ({ id, members, replicas: [], transfers: [], ...o });
const manifest = (o: Partial<ManifestView> = {}): ManifestView => ({ id: "2026-10-16-g", status: "reading", options: opts, sources: [src("s01"), src("s02")], styles: [], ...o });
const job = (attempt = 1): Job => {
  const j = parseAt("job", jobSchema, {
  id: "job:run:2026-10-16-g",
  of: { kind: "run", id: "2026-10-16-g" },
  producer: "extract",
  lane: "cloud.google",
  state: "queued",
  mode: { kind: "dry" },
  attempt,
  progress: { done: 0, total: 0 },
  spend: { usd: 0, unpriced: 0, basis: "reported" },
  failStreak: 0,
  });
  if (!j.ok) throw j.error;
  return j.value;
};
const SCENES = 4;

/** Walk `next` over a manifest the way perform would, marking each unit done. */
function order(m0: ManifestView): string[] {
  let m = m0;
  const out: string[] = [];
  for (let i = 0; i < 50; i++) {
    const u = next(m, SCENES);
    if (u === null) break;
    out.push(stepName(u));
    if (u.kind === "finish") break;
    m = perform(m, u);
  }
  return out;
}

function perform(m: ManifestView, u: Unit): ManifestView {
  switch (u.kind) {
    case "read":
      return { ...m, sources: m.sources.map((s) => (s.id === u.source ? { ...s, readback: {} } : s)) };
    case "group":
      return { ...m, styles: [style("warm", ["s01", "s02"]), style("cold", ["s02"])] };
    case "replica":
      return {
        ...m,
        styles: m.styles.map((s) => {
          if (s.id !== u.style) return s;
          const rep = s.replicas.find((r) => r.source === u.source);
          const rounds = [...(rep?.rounds ?? []), round({ score: u.round === 2 ? 0.9 : 0.5 })];
          return { ...s, replicas: [...s.replicas.filter((r) => r.source !== u.source), { source: u.source, rounds }] };
        }),
      };
    case "transfer":
      return { ...m, styles: m.styles.map((s) => (s.id === u.style ? { ...s, transfers: [...s.transfers, { scene: u.scene, file: "t.jpg", error: null }] } : s)) };
    case "finish":
      return { ...m, status: "done" };
  }
}

describe("the unit order the job's plan follows (v1 units.ts `next`)", () => {
  it("reads every source, groups once, replicates each style's members round by round, transfers, finishes", () => {
    expect(order(manifest({ sources: [src("s01", false), src("s02", false)] }))).toEqual([
      "read:s01",
      "read:s02",
      "group",
      "replica:warm:s01:r1",
      "replica:warm:s01:r2",
      "replica:warm:s02:r1",
      "replica:warm:s02:r2",
      "replica:cold:s02:r1",
      "replica:cold:s02:r2",
      "transfer:warm:0",
      "transfer:cold:0",
      "finish",
    ]);
  });

  it("skips a source whose read failed, and finishes at once when nothing was readable", () => {
    expect(next(manifest({ sources: [src("s01", false, "refused"), src("s02", false)] }), SCENES)).toEqual({ kind: "read", source: "s02" });
    expect(next(manifest({ sources: [src("s01", false, "refused")] }), SCENES)).toEqual({ kind: "finish" });
  });

  it("is null for a run that is done, failed or committed", () => {
    for (const status of ["done", "failed", "committed"] as const) expect(next(manifest({ status }), SCENES)).toBeNull();
  });

  it("caps transfers at the scenes that exist", () => {
    const m = manifest({ options: { ...opts, transfers: 9, rounds: 1, replicas: 1 }, styles: [style("warm", ["s01"], { replicas: [{ source: "s01", rounds: [round()] }] })] });
    expect(order(m).filter((n) => n.startsWith("transfer"))).toEqual(["transfer:warm:0", "transfer:warm:1", "transfer:warm:2", "transfer:warm:3"]);
  });

  it("counts progress against replicas that exist, not the ceiling", () => {
    const m = manifest({ status: "replicating", styles: [style("warm", ["s01"])] });
    expect(totalUnits(m, SCENES)).toBe(2 + 1 + (1 * 2 + 1) + 1);
    expect(doneUnits(m)).toBe(3);
  });
});

describe("settleReason: why a critique loop ended", () => {
  const m = manifest();
  it("is null while open, then names each of the four endings", () => {
    expect(settleReason(m, [])).toBeNull();
    expect(settleReason(m, [round()])).toBeNull();
    expect(settleReason(m, [round(), round()])).toBe("round-cap");
    expect(settleReason(m, [round({ file: null, error: "generate: 400" })])).toBe("generation-failed");
    expect(settleReason(m, [round({ score: 0.9 })])).toBe("target-met");
    expect(settleReason(m, [round({ critique: { recipe_fix: "short" } })])).toBe("no-usable-fix");
  });

  it("does not burn a round on an image whose critique failed: no fix, so the loop is settled and moves on", () => {
    expect(settleReason(m, [round({ error: "critique: 500", critique: null, score: null })])).toBe("no-usable-fix");
    expect(usableFix({ recipe_fix: FIX }, FIX.toUpperCase())).toBeNull();
  });
});

describe("planOf: one step, named by the unit", () => {
  const est = DEFAULT_CALL_ESTIMATE_USD;
  it("names the next unit with the estimate the ceiling is checked against", () => {
    const m = manifest({ status: "replicating", styles: [style("warm", ["s01"])] });
    expect(planOf(job(), new Set(), m, est, SCENES)).toEqual([{ name: "replica:warm:s01:r1", estimate: { seconds: 60, usd: 0.042 } }]);
    expect(planOf(job(), new Set(), manifest({ status: "done" }), est, SCENES)).toEqual([]);
  });

  it("revives a failed run first on each attempt, and halts - never reads done - if it fails again within it", () => {
    const failed = manifest({ status: "failed", error: "3 consecutive vendor failures" });
    expect(planOf(job(2), new Set(), failed, est, SCENES).map((s) => s.name)).toEqual(["revive:a2"]);
    expect(planOf(job(2), new Set(["revive:a2"]), failed, est, SCENES).map((s) => s.name)).toEqual(["halt:a2"]);
    expect(planOf(job(3), new Set(["revive:a2"]), failed, est, SCENES).map((s) => s.name)).toEqual(["revive:a3"]);
  });

  it("estimates each unit as v1 did: a read one recognise, a round a generate and a recognise, an ungrouped run no turn", () => {
    expect(unitEstimate({ kind: "read", source: "s01" }, "engine", est).usd).toBe(0.002);
    expect(unitEstimate({ kind: "group" }, "engine", est).usd).toBe(0.01);
    expect(unitEstimate({ kind: "group" }, "none", est).usd).toBe(0);
    expect(unitEstimate({ kind: "transfer", style: "w", scene: 0 }, "engine", est).usd).toBe(0.042);
  });
});

describe("classify: what a performed unit did", () => {
  const before = manifest({ status: "replicating", styles: [style("warm", ["s01"])] });
  const u: Unit = { kind: "replica", style: "warm", source: "s01", round: 1 };
  const withRound = (r: RoundView): ManifestView => ({ ...before, styles: [style("warm", ["s01"], { replicas: [{ source: "s01", rounds: [r] }] })] });

  it("a served round is produced, with its file and score", () => {
    expect(classify(before, withRound(round({ score: 0.7 })), u)).toEqual({ kind: "produced", output: { style: "warm", source: "s01", round: 1, file: "f.jpg", score: 0.7 } });
  });

  it("an image with a failed critique is a vendor failure (the breaker counts it); the pixels stay on run.json", () => {
    expect(classify(before, withRound(round({ error: "critique: 503", critique: null, score: null })), u)).toMatchObject({ kind: "vendor-failure" });
  });

  it("a NEW stop on run.json is a money stop, never a vendor failure", () => {
    const after = { ...before, status: "failed" as const, error: "The spend window refused it", stopped: { by: "period-ceiling" as const, at: "2026-10-16T10:00:00.000Z" } };
    expect(classify(before, after, u)).toEqual({ kind: "money-stop", message: "The spend window refused it" });
    expect(classify(after, { ...after, styles: withRound(round()).styles }, u).kind).toBe("produced");
  });

  it("a read with no readback is a vendor failure naming the source's error; a finish with nothing readable is fatal", () => {
    const read: Unit = { kind: "read", source: "s01" };
    expect(classify(manifest(), manifest({ sources: [src("s01", false, "400 bad key"), src("s02")] }), read)).toEqual({ kind: "vendor-failure", message: "read s01: 400 bad key" });
    expect(classify(manifest(), manifest({ status: "failed", error: "No source could be read back." }), { kind: "finish" })).toEqual({ kind: "fatal", code: "unavailable", message: "No source could be read back." });
  });
});

describe("entriesOf: what one served call books on the job", () => {
  it("a reported figure as itself; an absent one at its estimate AND counted unpriced (v1 spend.ts `book`)", () => {
    expect(entriesOf({ value: 1, model: "google/nb", costUsd: 0.039 }, "generate", 0.04)).toEqual([{ amount: 0.039, outcome: "served", basis: "vendor", axes: { call: "generate", model: "google/nb" } }]);
    const unpriced = entriesOf({ value: 1, model: "qwen/vl" }, "recognize", 0.002);
    expect(unpriced.map((e) => e.amount)).toEqual([0.002, undefined]);
    expect(unpriced[1]?.reason).toMatch(/reported no cost/);
  });

  it("an estimated figure keeps its basis, and a zero is a missing figure, not a free call", () => {
    expect(entriesOf({ value: 1, model: "m", costUsd: 0.04, basis: "estimated" }, "generate", 0.04)[0]?.basis).toBe("estimate");
    expect(entriesOf({ value: 1, model: "m", costUsd: 0 }, "generate", 0.04)).toEqual([{ amount: undefined, outcome: "served", basis: "vendor", axes: { call: "generate", model: "m" }, reason: "m reported $0 for a generate" }]);
  });
});
