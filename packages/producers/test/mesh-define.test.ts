import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import { enqueue, get } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { defineMeshStage, FINISH, MESH, meshRunId, parseMeshRunId, planStage, STAGE_ENGINE, STAGE_LANE, variantStep, type AssetView, type StagePorts, type UnitOutcome, type VariantStatus } from "../src/mesh/define.ts";

// The mesh and finish stages' definition over FAKE ports and a REAL kernel store: the run-id
// grammar, the plan read off the manifest, and what a job does with each kind of unit outcome
// (the variant's own failure is produced, an engine that never answered is the breaker's, an
// unusable asset is fatal). The binding to ComfyUI and Blender is tests/next-server/mesh-*.test.ts.

const tmp = mkdtempSync(path.join(tmpdir(), "gt-producers-mesh-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const ME: Holder = { bootId: "boot-a", pid: 501, host: "box-a" };
const RUN = { holder: ME, alive: () => true, sleep: async () => undefined };
const OP = { kind: "operator", id: "kazda" } as const;
const LIVE = { kind: "live", arm: { by: OP, at: "2026-10-22T12:00:00.000Z", reason: "test" } } as const;

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

function world(): { store: Store; fx: Effects } {
  const k = must(openKernel(path.join(tmp, `m-${++n}.sqlite`)));
  return { store: k.store, fx: liveEffects(k.store, blobStore(path.join(tmp, `blobs-${n}`))) };
}

const asset = (...vs: [string, VariantStatus][]): AssetView => ({ id: "axe-a", variants: vs.map(([id, status]) => ({ id, status })) });

/** Ports over an in-memory manifest: each unit moves its variant to `to` unless `answer` says otherwise. */
function fake(view: AssetView, o: { to?: VariantStatus; answer?: (v: string) => Result<UnitOutcome> | undefined; healthy?: boolean } = {}) {
  const calls = { units: [] as { v: string; dry: boolean }[], ended: [] as string[], health: 0 };
  let current = view;
  const ports: StagePorts = {
    load: () => ok(current),
    async unit(_a, v, io) {
      calls.units.push({ v, dry: io.dry });
      io.stillHeld();
      const said = o.answer?.(v);
      if (said !== undefined) return said;
      current = { ...current, variants: current.variants.map((x) => (x.id === v ? { ...x, status: o.to ?? "generated" } : x)) };
      return ok({ kind: "done", status: o.to ?? "generated" });
    },
    engineHealth: async () => (calls.health++, o.healthy === false ? { ok: false, reason: "ComfyUI at http://127.0.0.1:8188 does not answer" } : { ok: true }),
    ended: async (stage, t, _job, ending) => void calls.ended.push(`${stage}:${t.assetId}:${ending}`),
  };
  return { ports, calls };
}

const put = (s: Store, stage: "mesh" | "finish", extra: Record<string, unknown> = {}): string => {
  const id = `job:run:${meshRunId(stage, { assetId: "axe-a" })}`;
  must(enqueue(s, { id, of: { kind: "run", id: meshRunId(stage, { assetId: "axe-a" }) }, producer: stage, lane: STAGE_LANE[stage], ...extra }, OP));
  return id;
};

describe("the run id and the plan", () => {
  it("names an asset's stage run and one variant's, and reads both back; anything else is refused", () => {
    expect(meshRunId(MESH, { assetId: "axe-a" })).toBe("mesh:axe-a");
    expect(parseMeshRunId("finish:axe-a:m1")).toEqual({ stage: FINISH, target: { assetId: "axe-a", variantId: "m1" } });
    expect(parseMeshRunId("mesh:axe-a")).toEqual({ stage: MESH, target: { assetId: "axe-a" } });
    for (const bad of ["rig:axe-a", "mesh:", "mesh:axe-a:", "mesh:a:b:c", "scout-ingest:n"]) expect(parseMeshRunId(bad)).toBeNull();
  });

  it("the mesh stage takes pending variants, the finish stage generated ones, each once, in manifest order", () => {
    const a = asset(["t1", "pending"], ["m1", "pending"], ["t2", "generated"], ["x", "failed"]);
    expect(planStage(MESH, { assetId: "axe-a" }, a, new Set()).map((s) => s.name)).toEqual(["variant:t1", "variant:m1"]);
    expect(planStage(MESH, { assetId: "axe-a" }, a, new Set([variantStep("t1")])).map((s) => s.name)).toEqual(["variant:m1"]);
    expect(planStage(FINISH, { assetId: "axe-a" }, a, new Set()).map((s) => s.name)).toEqual(["variant:t2"]);
    expect(planStage(MESH, { assetId: "axe-a", variantId: "m1" }, a, new Set()).map((s) => s.name)).toEqual(["variant:m1"]);
    expect(planStage(FINISH, { assetId: "axe-a" }, a, new Set())[0]?.estimate.usd).toBe(0);
  });

  it("each stage names its own lane and engine, so admission charges the right profile", () => {
    const { ports } = fake(asset());
    expect([defineMeshStage(MESH, ports).lane, defineMeshStage(MESH, ports).engine]).toEqual(["gpu.local", "comfy"]);
    expect([defineMeshStage(FINISH, ports).lane, defineMeshStage(FINISH, ports).engine]).toEqual(["box.blender", "blender"]);
    expect(STAGE_ENGINE).toEqual({ mesh: "comfy", finish: "blender" });
  });
});

describe("a stage job", () => {
  it("a dry job runs every unit dry, books $0, and settles once done", async () => {
    const w = world();
    const id = put(w.store, MESH);
    const f = fake(asset(["t1", "pending"], ["m1", "pending"]));
    const r = must(await runJob(w.fx, defineMeshStage(MESH, f.ports), id, RUN));
    expect(r.outcome).toBe("done");
    expect(f.calls.units).toEqual([{ v: "t1", dry: true }, { v: "m1", dry: true }]);
    expect(f.calls.health).toBe(0);
    expect(f.calls.ended).toEqual(["mesh:axe-a:done"]);
    expect(must(get(w.store, id as Parameters<typeof get>[1])).job.spend.usd).toBe(0);
    w.store.close();
  });

  it("a variant's own failure is a produced unit: the job goes on to the next and ends done", async () => {
    const w = world();
    const id = put(w.store, FINISH);
    const f = fake(asset(["t1", "generated"], ["t2", "generated"]), { to: "finished", answer: (v) => (v === "t1" ? ok({ kind: "done", status: "failed", error: "finish.py exited 1: RuntimeError: boom" }) : undefined) });
    const r = must(await runJob(w.fx, defineMeshStage(FINISH, f.ports), id, RUN));
    expect(r.outcome).toBe("done");
    expect(f.calls.units.map((u) => u.v)).toEqual(["t1", "t2"]);
    w.store.close();
  });

  it("an engine that never answers is a vendor failure: the breaker fails the job and the settle is told", async () => {
    const w = world();
    const id = put(w.store, MESH);
    const f = fake(asset(["t1", "pending"]), { answer: () => ok({ kind: "unreachable", message: "ComfyUI at http://127.0.0.1:8188 did not answer: ECONNREFUSED" }) });
    const r = must(await runJob(w.fx, defineMeshStage(MESH, f.ports), id, RUN));
    expect(r.outcome).toBe("failed");
    expect(r.job?.error?.message).toContain("ECONNREFUSED");
    expect(f.calls.units.length).toBe(3);
    expect(f.calls.ended).toEqual(["mesh:axe-a:failed"]);
    w.store.close();
  });

  it("an asset that cannot be used is fatal at once, with its sentence", async () => {
    const w = world();
    const id = put(w.store, MESH);
    const f = fake(asset(["t1", "pending"]), { answer: () => err("not-found", "No asset called axe-a.") });
    const r = must(await runJob(w.fx, defineMeshStage(MESH, f.ports), id, RUN));
    expect(r.outcome).toBe("failed");
    expect(r.job?.error?.message).toBe("No asset called axe-a.");
    expect(f.calls.units.length).toBe(1);
    w.store.close();
  });

  it("a live job asks the engine first; an engine that is not there claims nothing", async () => {
    const w = world();
    const id = put(w.store, MESH, { mode: LIVE });
    const f = fake(asset(["t1", "pending"]), { healthy: false });
    const r = must(await runJob(w.fx, defineMeshStage(MESH, f.ports), id, RUN));
    expect(r.outcome).toBe("unhealthy");
    expect(f.calls.health).toBe(1);
    expect(f.calls.units).toEqual([]);
    w.store.close();
  });
});
