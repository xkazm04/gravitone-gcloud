// THE ENGINE'S DOOR (perfect 2026-11-08, scout-engine-core: failed-draws-spare-cap). The shape of 2026-10-26: thirty-two
// storyboards launched into a ComfyUI that was not there, every one failed in seconds with "ComfyUI is not reachable",
// and the night's cap read full. Held here:
//   - storyboardsUsed does not count a failed candidate, so the replayed night's cap is intact;
//   - the probe is asked for a live launch, never when an engine is injected in its place, and an unreachable engine
//     throws EngineUnreachable, which is not a Refusal;
//   - the night-fill tick leaves such an item `queued` and idles naming ComfyUI; a Refusal still settles it.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-gate-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

import { err, ok } from "@gt/domain/errors";
import { openKernel } from "@gt/kernel/kernel";
import { recordLoadSampleIn } from "@gt/kernel/resources/load";
import type { Store } from "@gt/kernel/store";

import { Refusal } from "../../lib/foundry/scout/acts.ts";
import { EngineUnreachable, requireComfy } from "../../lib/foundry/scout/comfyGate.ts";
import { nightFillTick } from "../../lib/foundry/scout/nightFill.ts";
import { planAct, readPlan, type PlanKind } from "../../lib/foundry/scout/plan.ts";
import type { PlanDoor, PlanDoors } from "../../lib/foundry/scout/planDoors.ts";
import { DEFAULT_STORYBOARD_CAP, type Night } from "../../lib/foundry/scout/types.ts";
import { storyboardCapOf, storyboardsUsed } from "../../lib/foundry/scout/storyboard.ts";
import { createNight, readNight } from "../../lib/foundry/scout/store.ts";

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const MIN = 60_000;
const T0 = Date.parse("2026-10-26T22:00:00.000Z");
const UNTIL = new Date(T0 + 8 * 60 * MIN).toISOString();
const actor = { kind: "agent", id: "scout-test" } as const;
let n = 0;
let store: Store;
let close: () => void = () => {};
afterEach(() => close());
beforeEach(() => {
  process.env["SCOUT_STORE_DIR"] = mkdtempSync(path.join(ROOT, "scout-"));
  const k = openKernel(path.join(ROOT, `k-${++n}.sqlite`), { clock: () => new Date(T0) });
  if (!k.ok) throw k.error;
  store = k.value.store;
  close = () => k.value.close();
});

const NOT_THERE = "ComfyUI is not reachable at http://127.0.0.1:8188, so no Flux frame was drawn (fetch failed)";

/** A night shaped as 2026-10-26's: `failed` storyboards that never drew, `kept` ones that did, one idea that is not a storyboard. */
const night = (failed: number, kept: number): Night =>
  ({
    id: "2026-10-26",
    candidates: [
      ...Array.from({ length: failed }, (_, i) => ({ id: `c-${i + 1}`, kind: "storyboard", status: "failed", error: NOT_THERE })),
      ...Array.from({ length: kept }, (_, i) => ({ id: `c-${100 + i}`, kind: "storyboard", status: "rendered" })),
      { id: "c-900", kind: "idea", status: "rendered" },
    ],
  }) as unknown as Night;

describe("storyboardsUsed", () => {
  it("replays 32 'ComfyUI is not reachable' failures: the cap is intact", () => {
    const dead = night(32, 0);
    expect(dead.candidates.filter((c) => c.kind === "storyboard" && c.status === "failed")).toHaveLength(32);
    expect(storyboardsUsed(dead)).toBe(0);
    expect(Math.max(0, storyboardCapOf(dead) - storyboardsUsed(dead))).toBe(DEFAULT_STORYBOARD_CAP);
  });

  it("still counts a pending or rendered storyboard, and only a storyboard", () => {
    expect(storyboardsUsed(night(32, 3))).toBe(3);
    const pending = { candidates: [{ id: "c-1", kind: "storyboard", status: "pending" }] } as unknown as Night;
    expect(storyboardsUsed(pending)).toBe(1);
  });
});

describe("requireComfy", () => {
  it("asks the injected probe, and an unreachable engine is EngineUnreachable, not a Refusal", async () => {
    const asked = vi.fn(async () => {});
    await requireComfy({ reachable: asked });
    expect(asked).toHaveBeenCalledTimes(1);
    const e = await requireComfy({
      reachable: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EngineUnreachable);
    expect(e).not.toBeInstanceOf(Refusal);
    expect((e as Error).message).toBe("ComfyUI is not reachable: connect ECONNREFUSED");
    const named = await requireComfy({
      reachable: async () => {
        throw new Error(NOT_THERE);
      },
    }).catch((x: unknown) => x);
    expect((named as Error).message).toBe(NOT_THERE);
  });

  it("does not ask when a test's own engine stands in for ComfyUI", async () => {
    await expect(requireComfy({ draw: async () => ({}) })).resolves.toBeUndefined();
  });
});

/** One sample a minute from T0 to `ms`, every resource at `v`. */
function samples(ms: number, v: number): void {
  const r = store.tx((t) => {
    for (let at = T0 + 1; at <= ms; at += MIN) recordLoadSampleIn(t, { atMs: at, load: { cpuBusy: v, gpuBusy: v }, ramUsedGb: v * 64, ramTotalGb: 64 });
  });
  if (!r.ok) throw r.error;
}

function doors(launch: PlanDoor["launch"]): PlanDoors {
  const door = (lane: "gpu.local" | "seat.text"): PlanDoor => ({ parse: async (p) => (typeof p === "object" ? ok(p) : err("invalid", "x")), lanes: () => [lane], launch });
  const kinds: PlanKind[] = ["storyboards", "ideas", "extract", "scenes", "assets", "sheets", "reels", "draft"];
  return Object.fromEntries(kinds.map((k) => [k, door(k === "draft" ? "seat.text" : "gpu.local")])) as PlanDoors;
}

describe("the night-fill tick and an engine that could not be asked", () => {
  it("leaves the item queued and idles naming ComfyUI; the next tick asks again; a Refusal still settles", async () => {
    const nt = await createNight({ dry: false, day: "2026-10-26", now: new Date(T0), deadline: UNTIL });
    let up = false;
    const d = doors(async (_c, _id, item) => {
      if (!up) throw new EngineUnreachable(NOT_THERE);
      if (item.id === "pl-02") throw new Refusal("night holds 25 of its 25 storyboards");
      return { jobId: `job:${item.id}` };
    });
    await planAct({ store, location: ":memory:", actor, dryOnly: true, live: false, detach: true, say: () => {}, now: () => new Date(T0) }, nt.id, [{ kind: "storyboards", payload: [1], why: "a" }, { kind: "storyboards", payload: [2], why: "b" }], d);
    samples(T0 + 70 * MIN, 0.2);
    const tick = (ms: number) => nightFillTick({ store, location: ":memory:", now: new Date(ms), dryOnly: false, doors: d });
    const down = await tick(T0 + 20 * MIN);
    expect(down).toMatchObject({ kind: "idle", night: nt.id });
    expect(down.kind === "idle" ? down.why : "").toBe(NOT_THERE);
    expect((await readPlan(nt.id)).map((x) => [x.id, x.state])).toEqual([["pl-01", "queued"], ["pl-02", "queued"]]);
    // The 32-failure shape on the plan's side: thirty-two ticks against a dead engine settle nothing.
    for (let i = 1; i <= 32; i++) await tick(T0 + (20 + i) * MIN);
    expect((await readPlan(nt.id)).every((x) => x.state === "queued")).toBe(true);
    up = true;
    expect(await tick(T0 + 60 * MIN)).toMatchObject({ kind: "launched", item: "pl-01", jobId: "job:pl-01" });
    expect(await tick(T0 + 61 * MIN)).toMatchObject({ kind: "refused", item: "pl-02" });
  });
});

describe("an engine that is down does not starve the items behind it", () => {
  it("a queued storyboard first and a draft second: the draft launches, the storyboard stays queued; alone, the tick idles naming ComfyUI", async () => {
    const nt = await createNight({ dry: false, day: "2026-10-26", now: new Date(T0), deadline: UNTIL });
    const asked: string[] = [];
    const d = doors(async (_c, _id, item) => {
      asked.push(item.id);
      if (item.kind === "storyboards") throw new EngineUnreachable(NOT_THERE);
      return { jobId: `job:${item.id}` };
    });
    const ctx = { store, location: ":memory:", actor, dryOnly: true, live: false, detach: true, say: () => {}, now: () => new Date(T0) } as const;
    await planAct(ctx, nt.id, [{ kind: "storyboards", payload: [1], why: "a" }, { kind: "storyboards", payload: [2], why: "b" }, { kind: "draft", payload: { prompt: "p", title: "t" }, why: "c" }], d);
    samples(T0 + 70 * MIN, 0.2);
    const tick = (ms: number) => nightFillTick({ store, location: ":memory:", now: new Date(ms), dryOnly: false, doors: d });
    expect(await tick(T0 + 20 * MIN)).toMatchObject({ kind: "launched", item: "pl-03", jobId: "job:pl-03" });
    // The probe is asked once for the lane: the second storyboard shares gpu.local and is skipped unasked.
    expect(asked).toEqual(["pl-01", "pl-03"]);
    expect((await readPlan(nt.id)).map((x) => [x.id, x.state])).toEqual([["pl-01", "queued"], ["pl-02", "queued"], ["pl-03", "launched"]]);
    expect((await readNight(nt.id)).candidates).toEqual([]);
    const alone = await tick(T0 + 21 * MIN);
    expect(alone).toMatchObject({ kind: "idle", night: nt.id });
    expect(alone.kind === "idle" ? alone.why : "").toBe(NOT_THERE);
    expect(asked.slice(2)).toEqual(["pl-01"]);
  });
});
