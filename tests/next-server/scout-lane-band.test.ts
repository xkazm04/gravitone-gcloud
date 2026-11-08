// A PLAN ITEM IS JUDGED ON ITS OWN LANES' RESOURCES (perfect 2026-11-08, scout-engine-core: per-lane-load-band).
// The replay of 2026-10-26 and 10-27-2: cpu near 25%, ram near 52%, the gpu at 80-96% under a loaded Flux, drafts on
// seat.text expiring unlaunched. `oldDecision` is the night-fill's overBand as it stood (one hot meter held every
// item); `newDecision` is the tick's. The table the replay prints is the measurement the direction asked for.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-band-"));
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
import { LOAD_BAND } from "@gt/domain/load";
import { RESOURCE_LANES, type ResourceLane } from "@gt/domain/lane";
import { openKernel } from "@gt/kernel/kernel";
import { recordLoadSampleIn } from "@gt/kernel/resources/load";
import type { Store } from "@gt/kernel/store";

import { bandResourcesOf, LANE_BAND_RESOURCES, overBandOn, type BandResource } from "../../lib/foundry/scout/laneBand.ts";
import type { RecentLoad } from "../../lib/foundry/scout/load.ts";
import { nightFillTick, overBand } from "../../lib/foundry/scout/nightFill.ts";
import { planAct, readPlan, type PlanKind } from "../../lib/foundry/scout/plan.ts";
import type { PlanDoor, PlanDoors } from "../../lib/foundry/scout/planDoors.ts";
import { createNight } from "../../lib/foundry/scout/store.ts";

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

/** overBand as it stood before the direction: every resource the samples read, whatever the item. */
function oldDecision(l: RecentLoad): string | undefined {
  if (l.samples === 0) return `no load samples in the last ${l.minutes} min`;
  const read = (["cpu", "ram", "gpu"] as const).filter((k) => l.avg[k] !== undefined);
  if (read.length === 0) return `no resource read in the last ${l.minutes} min`;
  const high = read.filter((k) => (l.avg[k] ?? 0) >= l.band.low);
  return high.length === 0 ? undefined : `the box is at the band: ${high.join(" ")}`;
}

const newDecision = (l: RecentLoad, lane: ResourceLane): string | undefined => overBandOn(l, bandResourcesOf([lane]));

const reading = (cpu: number, ram: number, gpu: number): RecentLoad => ({ minutes: 15, samples: 15, avg: { cpu, ram, gpu }, band: LOAD_BAND, waiting: [] });

describe("the lane-to-resource map", () => {
  it("judges gpu.local on all three, seat.text and the local-browser and reels lanes on cpu and ram, a cloud lane on nothing", () => {
    expect(bandResourcesOf(["gpu.local"])).toEqual(["cpu", "ram", "gpu"]);
    expect(bandResourcesOf(["seat.text"])).toEqual(["cpu", "ram"]);
    expect(bandResourcesOf(["box.chrome"])).toEqual(["cpu", "ram"]);
    expect(bandResourcesOf(["box.render"])).toEqual(["cpu", "ram"]);
    for (const l of ["cloud.google", "cloud.elevenlabs", "cloud.leonardo", "cloud.qwen"] as const) expect(bandResourcesOf([l])).toEqual([]);
    // An item on two lanes is judged on the union.
    expect(bandResourcesOf(["seat.text", "gpu.local"])).toEqual(["cpu", "ram", "gpu"]);
  });

  it("fails closed: a lane the map does not name is judged on all three", () => {
    expect(LANE_BAND_RESOURCES["box.blender"]).toBeUndefined();
    expect(bandResourcesOf(["box.blender"])).toEqual(["cpu", "ram", "gpu"]);
    expect(bandResourcesOf(["cloud.google", "box.blender"])).toEqual(["cpu", "ram", "gpu"]);
    expect(overBandOn(reading(0.25, 0.52, 0.9), bandResourcesOf(["box.blender"]))).toMatch(/^the box is at the band: gpu 90%/);
  });

  it("keeps the wording the roster prints, and an item that loads nothing local is never held", () => {
    expect(overBandOn(reading(0.65, 0.7, 0.9), ["cpu", "ram", "gpu"])).toBe("the box is at the band: cpu 65% · ram 70% · gpu 90% over 15 min (low 60%)");
    expect(overBand(reading(0.65, 0.7, 0.9))).toBe("the box is at the band: cpu 65% · ram 70% · gpu 90% over 15 min (low 60%)");
    expect(overBandOn({ ...reading(0, 0, 0), samples: 0, avg: {} }, ["cpu"])).toBe("no load samples in the last 15 min");
    expect(overBandOn({ ...reading(0, 0, 0), samples: 0, avg: {} }, [])).toBeUndefined();
    expect(overBandOn({ ...reading(0, 0, 0), avg: {} }, ["ram"])).toBe("no resource read in the last 15 min");
  });
});

describe("the replay: cpu 25%, ram 52%, gpu 80-96%", () => {
  const items: readonly { readonly name: string; readonly lane: ResourceLane }[] = [
    { name: "draft (seat.text)", lane: "seat.text" },
    { name: "storyboards (gpu.local)", lane: "gpu.local" },
    { name: "ideas (box.chrome)", lane: "box.chrome" },
    { name: "reels (box.render)", lane: "box.render" },
    { name: "scenes (cloud.leonardo)", lane: "cloud.leonardo" },
    { name: "assets (box.blender)", lane: "box.blender" },
  ];

  it("launches under the new decision what the old decision held, and never an item over its own resources' band", () => {
    const rows: string[] = ["gpu    | " + items.map((i) => i.name).join(" | ") + "  (L = launches, . = held)"];
    const oldLaunches: string[] = [];
    const newLaunches = new Set<string>();
    for (const gpu of [0.8, 0.85, 0.9, 0.96]) {
      const l = reading(0.25, 0.52, gpu);
      const cells = items.map((i) => {
        const was = oldDecision(l) === undefined;
        const now = newDecision(l, i.lane) === undefined;
        if (was) oldLaunches.push(`${gpu}:${i.name}`);
        if (now) newLaunches.add(i.name);
        return `${was ? "L" : "."}->${now ? "L" : "."}`;
      });
      rows.push(`${String(Math.round(gpu * 100)).padEnd(6)} | ${cells.join(" | ")}`);
    }
    console.info(`old -> new, cpu 25% ram 52%:\n${rows.join("\n")}`);
    expect(oldLaunches).toEqual([]);
    expect([...newLaunches].sort()).toEqual(["draft (seat.text)", "ideas (box.chrome)", "reels (box.render)", "scenes (cloud.leonardo)"]);
  });

  it("holds across every cpu, ram and gpu reading: a launch implies every resource the lane uses is under the band", () => {
    const grid = [0, 0.25, 0.52, 0.59, 0.6, 0.8, 0.96];
    let launches = 0;
    for (const lane of RESOURCE_LANES) {
      for (const cpu of grid) for (const ram of grid) for (const gpu of grid) {
        const l = reading(cpu, ram, gpu);
        const launched = newDecision(l, lane) === undefined;
        const uses: readonly BandResource[] = bandResourcesOf([lane]);
        const over = uses.filter((k) => ({ cpu, ram, gpu })[k] >= LOAD_BAND.low);
        expect(launched).toBe(over.length === 0);
        if (launched) launches += 1;
        // Never more permissive than the old rule for a lane that uses everything.
        if (uses.length === 3) expect(launched).toBe(oldDecision(l) === undefined);
      }
    }
    expect(launches).toBeGreaterThan(0);
  });
});

function samples(ms: number, o: { cpu: number; ram: number; gpu: number }): void {
  const r = store.tx((t) => {
    for (let at = T0 + 1; at <= ms; at += MIN) recordLoadSampleIn(t, { atMs: at, load: { cpuBusy: o.cpu, gpuBusy: o.gpu }, ramUsedGb: o.ram * 64, ramTotalGb: 64 });
  });
  if (!r.ok) throw r.error;
}

describe("the tick on a hot card", () => {
  it("skips the gpu item for the draft behind it, then holds the gpu item with its own reason", async () => {
    const nt = await createNight({ dry: false, day: "2026-10-26", now: new Date(T0), deadline: UNTIL });
    const LANE: Partial<Record<PlanKind, ResourceLane>> = { storyboards: "gpu.local", draft: "seat.text", sheets: "gpu.local" };
    const kinds: PlanKind[] = ["storyboards", "ideas", "extract", "scenes", "assets", "sheets", "reels", "draft"];
    const door = (kind: PlanKind): PlanDoor => ({ parse: async (p) => (typeof p === "object" ? ok(p) : err("invalid", "x")), lanes: () => [LANE[kind] ?? "cloud.google"], launch: async (_c, _id, item) => ({ jobId: `job:${item.id}` }) });
    const doors = Object.fromEntries(kinds.map((k) => [k, door(k)])) as PlanDoors;
    await planAct({ store, location: ":memory:", actor, dryOnly: true, live: false, detach: true, say: () => {}, now: () => new Date(T0) }, nt.id, [{ kind: "storyboards", payload: [1], why: "a" }, { kind: "draft", payload: { prompt: "p", title: "t" }, why: "b" }, { kind: "sheets", payload: {}, why: "c" }], doors);
    samples(T0 + 30 * MIN, { cpu: 0.25, ram: 0.52, gpu: 0.9 });
    const tick = (ms: number) => nightFillTick({ store, location: ":memory:", now: new Date(ms), dryOnly: false, doors });
    expect(await tick(T0 + 20 * MIN)).toMatchObject({ kind: "launched", item: "pl-02", jobId: "job:pl-02" });
    const held = await tick(T0 + 21 * MIN);
    expect(held).toMatchObject({ kind: "idle", night: nt.id });
    expect(held.kind === "idle" ? held.why : "").toMatch(/^the box is at the band: gpu 90% over 15 min \(low 60%\)$/);
    expect((await readPlan(nt.id)).map((x) => [x.id, x.state])).toEqual([["pl-01", "queued"], ["pl-02", "launched"], ["pl-03", "queued"]]);
  });
});
