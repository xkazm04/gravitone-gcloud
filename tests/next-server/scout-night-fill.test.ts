// THE NIGHT REBALANCER (spark scout-vision S6 WP-D) - lib/foundry/scout/plan.ts `planAct` and the worker's `night-fill`
// tick (lib/foundry/scout/nightFill.ts, bound in lib/producers/nightFill.ts) over a temp kernel store and a temp scout
// root per test, a fake clock, and FAKE DOORS - no producer is launched, no vendor or model is reached:
//   · plan: each payload through its kind's door parser, a refused item refuses the batch (its place and the door's
//     sentence) and writes nothing; pl-NN numbering across batches; a night without an until, or closed, is refused;
//     the real doors' parse-only entries refuse a bad extract and a bad draft payload without launching;
//   · the tick: one launch per tick, in the night's mode with the timer as actor and detached; a busy lane skips to the
//     next item on an idle lane; a box at the band launches nothing; no samples launches nothing; a Refusal is
//     `refused` and never retried, any other throw `failed`;
//   · at the until: the queued items expire and the night closes as `close --stop deadline`; a night the seat closed is
//     left alone;
//   · a draft item writes drafts/<pl-NN>.md through a fake text turn, and the next taste lists it.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-fill-"));
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

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { err, ok } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import { enqueue } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { recordLoadSampleIn } from "@gt/kernel/resources/load";
import type { Store } from "@gt/kernel/store";
import { NIGHT_FILL, TIMER_NAMES } from "@gt/producers/publish/timers";

import { Refusal, type ActContext } from "../../lib/foundry/scout/acts.ts";
import { EXPIRED_REASON, nightFillTick } from "../../lib/foundry/scout/nightFill.ts";
import { planAct, planFile, readPlan, type PlanItem, type PlanKind } from "../../lib/foundry/scout/plan.ts";
import { planDoors, type PlanDoor, type PlanDoors } from "../../lib/foundry/scout/planDoors.ts";
import { closeWith } from "../../lib/foundry/scout/acts.ts";
import { createNight, nightDir, readNight } from "../../lib/foundry/scout/store.ts";
import { draftsSection, DRAFTS_HEADING } from "../../lib/foundry/scout/tasteDrafts.ts";
import { nightFillTimer } from "../../lib/producers/nightFill.ts";
import type { TickContext } from "../../workers/timers.ts";

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
  // A fresh scout root and kernel per test: the tick reads every open night on the root.
  process.env["SCOUT_STORE_DIR"] = mkdtempSync(path.join(ROOT, "scout-"));
  const k = openKernel(path.join(ROOT, `k-${++n}.sqlite`), { clock: () => new Date(T0) });
  if (!k.ok) throw k.error;
  store = k.value.store;
  close = () => k.value.close();
});

const ctxAt = (ms: number): ActContext => ({ store, location: ":memory:", actor, dryOnly: true, live: false, detach: true, say: () => {}, now: () => new Date(ms) });

/** Fifteen minutes of samples before `ms`, every resource at `v`. */
function samples(ms: number, v: number): void {
  const r = store.tx((t) => {
    for (let i = 1; i <= 15; i++) recordLoadSampleIn(t, { atMs: ms - i * MIN + 1, load: { cpuBusy: v, gpuBusy: v }, ramUsedGb: v * 64, ramTotalGb: 64 });
  });
  if (!r.ok) throw r.error;
}

type Fake = { readonly doors: PlanDoors; readonly launched: { kind: PlanKind; item: string; ctx: ActContext }[] };

/** Doors that parse everything but `{bad: why}`, each on its own lane, and launch per `act` (default: a job id). */
function fakeDoors(act: Partial<Record<PlanKind, (item: PlanItem) => Promise<{ jobId?: string }>>> = {}, lanes: Partial<Record<PlanKind, ResourceLane>> = {}): Fake {
  const launched: Fake["launched"] = [];
  const LANE: Record<PlanKind, ResourceLane> = { storyboards: "gpu.local", ideas: "box.chrome", extract: "cloud.google", scenes: "cloud.leonardo", assets: "box.blender", sheets: "gpu.local", reels: "box.render", draft: "seat.text", ...lanes };
  const door = (kind: PlanKind): PlanDoor => ({
    parse: async (p) => (typeof p === "object" && p !== null && "bad" in p ? err("invalid", String((p as { bad: unknown }).bad)) : ok(p)),
    lanes: () => [LANE[kind]],
    launch: async (ctx, _id, item) => {
      launched.push({ kind, item: item.id, ctx });
      return (act[kind] ?? (async (it) => ({ jobId: `job:${it.id}` })))(item);
    },
  });
  const doors = Object.fromEntries((["storyboards", "ideas", "extract", "scenes", "assets", "sheets", "reels", "draft"] as const).map((k) => [k, door(k)])) as PlanDoors;
  return { doors, launched };
}

async function night(day: string, o: { deadline?: string; dry?: boolean } = {}): Promise<string> {
  const nt = await createNight({ dry: o.dry ?? true, day, now: new Date(T0), ...(o.deadline === null ? {} : { deadline: o.deadline ?? UNTIL }) });
  return nt.id;
}

const tick = (fake: Fake, ms: number) => nightFillTick({ store, location: ":memory:", now: new Date(ms), dryOnly: false, doors: fake.doors });

describe("planAct", () => {
  it("appends validated items as pl-NN, queued at now, and refuses a batch with one bad item whole", async () => {
    const id = await night("2026-10-26");
    const f = fakeDoors();
    await expect(planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "rung 1" }, { kind: "storyboards", payload: { bad: "storyboard 1: fromIdea: not kept" }, why: "rung 2" }], f.doors)).rejects.toThrow(
      "plan item 2 (storyboards): storyboard 1: fromIdea: not kept",
    );
    expect(existsSync(planFile(id))).toBe(false);
    await expect(planAct(ctxAt(T0), id, [{ kind: "nope", payload: {}, why: "x" }], f.doors)).rejects.toThrow(/plan item 1/);
    await expect(planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [], why: "two\nlines" }], f.doors)).rejects.toThrow(/one line/);

    const a = await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "rung 1" }, { kind: "draft", payload: { prompt: "p", title: "t" }, why: "rung 2" }], f.doors);
    expect(a.items.map((x) => [x.id, x.kind, x.state, x.at])).toEqual([["pl-01", "ideas", "queued", new Date(T0).toISOString()], ["pl-02", "draft", "queued", new Date(T0).toISOString()]]);
    const b = await planAct(ctxAt(T0 + MIN), id, [{ kind: "sheets", payload: {}, why: "rung 3" }], f.doors);
    expect(b.items.map((x) => x.id)).toEqual(["pl-03"]);
    expect((await readPlan(id)).map((x) => x.id)).toEqual(["pl-01", "pl-02", "pl-03"]);
    expect(f.launched).toEqual([]);
  });

  it("refuses a night without an until, past it, or closed; the real doors' parsers refuse without launching", async () => {
    const none = await night("2026-10-27", { deadline: null as never });
    await expect(planAct(ctxAt(T0), none, [{ kind: "sheets", payload: {}, why: "x" }], fakeDoors().doors)).rejects.toThrow(/has no until/);
    const id = await night("2026-10-28");
    await expect(planAct(ctxAt(Date.parse(UNTIL) + 1), id, [{ kind: "sheets", payload: {}, why: "x" }], fakeDoors().doors)).rejects.toThrow(/passed its until/);
    const real = planDoors();
    await expect(planAct(ctxAt(T0), id, [{ kind: "extract", payload: { sources: ["x-1"] }, why: "x" }], real)).rejects.toThrow(/plan item 1 \(extract\).*source id/);
    await expect(planAct(ctxAt(T0), id, [{ kind: "draft", payload: { prompt: "only" }, why: "x" }], real)).rejects.toThrow(/plan item 1 \(draft\).*title/);
    await expect(planAct(ctxAt(T0), id, [{ kind: "ideas", payload: {}, why: "x" }], real)).rejects.toThrow(/plan item 1 \(ideas\): ideas: the input is a JSON array/);
    await expect(planAct(ctxAt(T0), id, [{ kind: "scenes", payload: { source: "s-01", use: "a cold open" } }, { kind: "sheets", payload: { character: "Mara" }, why: "y" }].map((x) => ({ why: "x", ...x })), real)).resolves.toMatchObject({ items: [{ id: "pl-01" }, { id: "pl-02" }] });
    await closeWith(id, "operator", new Date(T0));
    await expect(planAct(ctxAt(T0), id, [{ kind: "sheets", payload: {}, why: "x" }], real)).rejects.toThrow(/is closed \(operator\)/);
  });
});

describe("the night-fill tick", () => {
  it("launches one item a tick, in the night's mode, detached, as the timer", async () => {
    const id = await night("2026-10-26", { dry: false });
    const f = fakeDoors();
    await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "a" }, { kind: "extract", payload: {}, why: "b" }], f.doors);
    samples(T0 + 20 * MIN, 0.3);
    const one = await tick(f, T0 + 20 * MIN);
    expect(one).toMatchObject({ kind: "launched", night: id, item: "pl-01", jobId: "job:pl-01" });
    expect(f.launched).toHaveLength(1);
    expect(f.launched[0]?.ctx).toMatchObject({ actor: { kind: "machine", id: "night-fill" }, detach: true, live: true, dryOnly: false });
    expect(await tick(f, T0 + 21 * MIN)).toMatchObject({ kind: "launched", item: "pl-02" });
    expect((await readPlan(id)).map((x) => [x.state, x.jobId])).toEqual([["launched", "job:pl-01"], ["launched", "job:pl-02"]]);
    expect(await tick(f, T0 + 22 * MIN)).toMatchObject({ kind: "idle", why: "the plan has nothing queued" });
  });

  it("skips an item whose lane is busy for the next one on an idle lane, and waits when every lane is busy", async () => {
    const id = await night("2026-10-26");
    const f = fakeDoors();
    await planAct(ctxAt(T0), id, [{ kind: "storyboards", payload: [1], why: "a" }, { kind: "ideas", payload: [1], why: "b" }], f.doors);
    const j = enqueue(store, { id: "job:busy", of: { kind: "run", id: "run-busy" }, producer: "scout-storyboard", lane: "gpu.local" }, actor);
    if (!j.ok) throw j.error;
    samples(T0 + 20 * MIN, 0.2);
    expect(await tick(f, T0 + 20 * MIN)).toMatchObject({ kind: "launched", item: "pl-02" });
    expect(await tick(f, T0 + 21 * MIN)).toMatchObject({ kind: "idle", why: "every queued item's lane is busy (1 queued)" });
    expect(f.launched.map((x) => x.item)).toEqual(["pl-02"]);
  });

  it("launches nothing while the box sits at the band, or with no samples", async () => {
    const id = await night("2026-10-26");
    const f = fakeDoors();
    await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "a" }], f.doors);
    expect(await tick(f, T0 + 20 * MIN)).toMatchObject({ kind: "idle", why: "no load samples in the last 15 min" });
    samples(T0 + 20 * MIN, 0.65);
    const r = await tick(f, T0 + 20 * MIN);
    expect(r).toMatchObject({ kind: "idle", night: id });
    expect(r.kind === "idle" ? r.why : "").toMatch(/^the box is at the band: cpu 65% · ram 65% · gpu 65%/);
    expect(f.launched).toEqual([]);
  });

  it("records a door's Refusal as refused and any other throw as failed, never retrying either", async () => {
    const id = await night("2026-10-26");
    const f = fakeDoors({
      ideas: async () => {
        throw new Refusal("night 2026-10-26 holds 25 of its 25 ideas; 0 left");
      },
      extract: async () => {
        throw new Error("extract launch: the store is locked");
      },
    });
    await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "a" }, { kind: "extract", payload: {}, why: "b" }, { kind: "sheets", payload: {}, why: "c" }], f.doors);
    samples(T0 + 20 * MIN, 0.1);
    expect(await tick(f, T0 + 20 * MIN)).toMatchObject({ kind: "refused", item: "pl-01", reason: "night 2026-10-26 holds 25 of its 25 ideas; 0 left" });
    expect(await tick(f, T0 + 20 * MIN)).toMatchObject({ kind: "failed", item: "pl-02", reason: "extract launch: the store is locked" });
    expect(await tick(f, T0 + 20 * MIN)).toMatchObject({ kind: "launched", item: "pl-03" });
    expect(f.launched.map((x) => x.item)).toEqual(["pl-01", "pl-02", "pl-03"]);
    expect((await readPlan(id)).map((x) => [x.id, x.state, x.reason])).toEqual([
      ["pl-01", "refused", "night 2026-10-26 holds 25 of its 25 ideas; 0 left"],
      ["pl-02", "failed", "extract launch: the store is locked"],
      ["pl-03", "launched", undefined],
    ]);
  });

  it("at the until expires what is queued and closes the night as close --stop deadline; a night the seat closed is left alone", async () => {
    const id = await night("2026-10-26");
    const f = fakeDoors();
    await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "a" }, { kind: "sheets", payload: {}, why: "b" }], f.doors);
    samples(T0 + 20 * MIN, 0.1);
    await tick(f, T0 + 20 * MIN);
    const at = Date.parse(UNTIL) + MIN;
    expect(await tick(f, at)).toEqual({ kind: "closed", night: id, expired: 1 });
    expect((await readPlan(id)).map((x) => [x.state, x.reason ?? null])).toEqual([["launched", null], ["expired", EXPIRED_REASON]]);
    const n = await readNight(id);
    expect([n.state, n.stop, n.closedAt]).toEqual(["closed", "deadline", new Date(at).toISOString()]);
    expect(f.launched).toHaveLength(1);

    const early = await night("2026-10-27");
    await planAct(ctxAt(T0), early, [{ kind: "ideas", payload: [1], why: "a" }], f.doors);
    await closeWith(early, "target", new Date(T0 + 60 * MIN));
    const before = readFileSync(planFile(early), "utf8");
    expect(await tick(f, at)).toMatchObject({ kind: "idle", why: "no open night with an until and a plan" });
    expect(readFileSync(planFile(early), "utf8")).toBe(before);
    expect((await readNight(early)).stop).toBe("target");
  });

  it("the timer binds the tick and counts a launch; night-fill is a named timer every five minutes", async () => {
    expect(TIMER_NAMES).toContain("night-fill");
    expect(NIGHT_FILL.everyMs).toBe(5 * MIN);
    const id = await night("2026-10-26");
    const f = fakeDoors();
    await planAct(ctxAt(T0), id, [{ kind: "ideas", payload: [1], why: "a" }], f.doors);
    samples(T0 + 20 * MIN, 0.1);
    const ctx: TickContext = { now: new Date(T0 + 20 * MIN), signal: new AbortController().signal, beat: async () => {} };
    const r = await nightFillTimer({ store, location: ":memory:", env: {}, doors: f.doors }).tick(ctx);
    expect(r).toMatchObject({ ok: true, value: { count: 1, what: "plan item(s) launched", detail: { night: id, item: "pl-01", state: "launched" } } });
  });
});

describe("a draft item", () => {
  it("writes drafts/<pl-NN>.md through the draft turn, never a candidate, and the next taste lists it", async () => {
    const id = await night("2026-10-26");
    const asked: string[] = [];
    const doors = planDoors({
      draftText: async (prompt) => {
        asked.push(prompt);
        return { text: "A lighthouse keeper counts ships that never arrive.", served: "ollama qwen3.8:27b" };
      },
    });
    await planAct(ctxAt(T0), id, [{ kind: "draft", payload: { prompt: "Write a 60-word premise.", title: "The keeper" }, why: "fills the box while it idles" }], doors);
    samples(T0 + 20 * MIN, 0.1);
    expect(await nightFillTick({ store, location: ":memory:", now: new Date(T0 + 20 * MIN), dryOnly: false, doors })).toMatchObject({ kind: "launched", item: "pl-01" });
    expect(asked).toEqual(["Write a 60-word premise."]);
    const file = path.join(nightDir(id), "drafts", "pl-01.md");
    const text = readFileSync(file, "utf8");
    expect(text).toMatch(/^# The keeper\n\nA lighthouse keeper counts ships that never arrive\.\n/);
    expect(text).toContain("pl-01 · ollama qwen3.8:27b");
    expect((await readNight(id)).candidates).toEqual([]);
    expect(await draftsSection([await readNight(id)])).toEqual([DRAFTS_HEADING, "", `night ${id}:`, `- The keeper - ${file}`, ""]);
    expect(await draftsSection([])).toEqual([]);
  });
});
