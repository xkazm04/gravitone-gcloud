// A KEPT CONCEPT STARTED AS A PRODUCTION (spark concept-casting-stages S1) over temp Scout files and a temp kernel: each
// of the three sources starts; a started episode stops being due; a hero take renders dry and through a fake H3 engine
// and a rough cut through a fake cutter, then the operator marks it proven and an agent is refused. No ComfyUI, no GPU:
// fetch throws, and the live engine is a fake.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-production-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "scout-channels");
  process.env["SCOUT_CODEX_DIR"] = path.join(dir, "scout-codex");
  process.env["SCOUT_OUTLINES_DIR"] = path.join(dir, "scout-outlines");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { productionIdSchema, type ProductionId } from "@gt/domain/production";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { readProduction } from "@gt/kernel/productions/store";

import { dueEpisode } from "../../lib/foundry/scout/storyboardEpisode.ts";
import { episodesDue } from "../../lib/foundry/scout/channels.ts";
import { keptConcepts } from "../../lib/foundry/scout/concepts.ts";
import { setEpisodeDoorForTests } from "../../lib/foundry/scout/episodeMoves.ts";
import { Refusal } from "../../lib/foundry/scout/acts.ts";
import { setH3Graph } from "../../lib/imaging/video/comfyH3.ts";
import { driveTake, markProven, moveProduction, requestTake, startProduction, takeSeed, type RequestTakeInput } from "../../lib/producers/production.ts";
import { producers } from "../../lib/producers/registry.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op" };
const PNG = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, k]);
const MP4 = (k: number) => new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, k]);
const frame = (k: number) => ({ name: `panel-${k}`, prompt: `prompt ${k}`, chain: k > 1 });

function writeEpisodes(): void {
  const dir = path.join(ROOT, "scout-channels");
  mkdirSync(dir, { recursive: true });
  const ep = (id: string, state: string, extra: Record<string, unknown> = {}) => ({ id, channel: "F1", title: `Title ${id}`, logline: `logline ${id}`, beats: ["b1", "b2", "b3", "b4", "b5"], spec: "s", state, at: "2026-11-01T00:00:00.000Z", ...extra });
  writeFileSync(path.join(dir, "F1.json"), JSON.stringify({ channel: { id: "F1", name: "Foundry", group: "Docs", audience: "a", promise: "p", gap: "g", edge: "e", medium: "storyboard" }, episodes: [ep("F1-11", "outline-kept"), ep("F1-12", "outline-kept"), ep("F1-20", "thrown")] }));
}

function writeCodex(): void {
  const dir = path.join(ROOT, "scout-codex", "2026-11-08");
  const queue = ["F1-11", "S1-90"].map((id) => ({ id, tier: 1, title: `Board ${id}`, paragraph: `the board of ${id}`, bullets: ["Format: short"], frames: [frame(1), frame(2)] }));
  for (const q of queue) {
    const d = path.join(dir, "t1", q.id);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "panel-1.png"), PNG(1));
    writeFileSync(path.join(d, "panel-2.png"), PNG(2));
  }
  writeFileSync(path.join(dir, "queue.json"), JSON.stringify([...queue, { id: "char-a-002-camille", tier: 6, title: "Camille", frames: [{ name: "concept", prompt: "a portrait" }] }]));
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ items: { "F1-11": { verdict: "keep" }, "S1-90": { verdict: "keep" }, "char-a-002-camille": { verdict: "keep" } } }));
}

function writeOutlines(withVerdicts: boolean): void {
  const dir = path.join(ROOT, "scout-outlines", "2026-11-09");
  mkdirSync(path.join(dir, "t1", "2026-10-23-2_c-08"), { recursive: true });
  writeFileSync(path.join(dir, "t1", "2026-10-23-2_c-08", "panel-1.png"), PNG(9));
  writeFileSync(path.join(dir, "outlines.json"), JSON.stringify([{ id: "2026-10-23-2/c-08", title: "The Red Window", logline: "one window", beats: ["Hook", "Turn"] }]));
  writeFileSync(path.join(dir, "queue.json"), JSON.stringify([{ id: "2026-10-23-2/c-08", tier: 1, title: "The Red Window", paragraph: "p", bullets: [], frames: [frame(1)] }]));
  const verdictsAt = path.join(dir, "verdicts.json");
  if (withVerdicts) writeFileSync(verdictsAt, JSON.stringify({ items: { "2026-10-23-2/c-08": { verdict: "approve" }, "2026-10-23-2/c-09": { verdict: "drop" } } }));
  else rmSync(verdictsAt, { force: true });
}

let store: Store;

beforeAll(() => {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  store = k.value.store;
  writeEpisodes();
  writeCodex();
  writeOutlines(false);
});

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setEpisodeDoorForTests(null);
});

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const asId = (s: string): ProductionId => {
  const r = productionIdSchema.safeParse(s);
  if (!r.success) throw r.error;
  return r.data;
};

const receiptOf = async (input: RequestTakeInput): Promise<string> => {
  const r = await requestTake(input);
  if (!r.ok) throw r.error;
  if (r.value.kind !== "receipt") throw new Error(`expected a receipt, got ${r.value.kind}`);
  return r.value.receipt.token;
};

const launch = async (input: RequestTakeInput): Promise<{ jobId: string; takeId: string }> => {
  const token = await receiptOf(input);
  const r = await requestTake({ ...input, token });
  if (!r.ok) throw r.error;
  if (r.value.kind !== "launched") throw new Error(`expected launched, got ${r.value.kind}`);
  return r.value;
};

const take = (id: ProductionId, takeId: string) => {
  const p = store.read((r) => readProduction(r, id));
  if (!p.ok || p.value === undefined) throw new Error("no production");
  const t = p.value.takes.find((x) => x.id === takeId);
  if (t === undefined) throw new Error(`no ${takeId}`);
  return { production: p.value, take: t };
};

describe("what can start", () => {
  it("offers a kept episode's board under the episode, a board that is no episode as itself, and no outline until verdicts exist", async () => {
    const concepts = await keptConcepts();
    expect(concepts.map((c) => `${c.source.kind}:${c.source.ref}`).sort()).toEqual(["codex-board:2026-11-08/S1-90", "episode:F1-11"]);
    expect(concepts.find((c) => c.source.ref === "F1-11")?.matches).toEqual(["F1-11"]);
  });

  it("offers an approved outline once its verdict file stands, and not a dropped one", async () => {
    writeOutlines(true);
    const outlines = (await keptConcepts()).filter((c) => c.source.kind === "outline");
    expect(outlines.map((c) => c.source.ref)).toEqual(["2026-10-23-2/c-08"]);
    expect(outlines[0]?.matches).toEqual(["2026-10-23-2/c-08"]);
  });
});

describe("a production's life", () => {
  it("starts from a kept episode, is no longer due, then renders one dry hero take, which cannot prove the concept", async () => {
    const started = await startProduction({ source: { kind: "episode", ref: "F1-11" }, by: "op" });
    if (!started.ok) throw started.error;
    const p = started.value;
    expect(p.id).toBe("prdn:title-f1-11");
    expect(p.board.panels.map((x) => x.id)).toEqual(["panel-1", "panel-2"]);
    expect(p.board.panels[0]?.beat).toBe("b1");

    // Taken: the due queue and the storyboard door both read the record.
    const due = (await episodesDue()).flatMap((d) => d.episodes.map((e) => e.id));
    expect(due).toEqual(["F1-12"]);
    setEpisodeDoorForTests({ episodeOf: async () => ({ channel: { id: "F1", name: "Foundry" } as never, episode: { id: "F1-11", channel: "F1", title: "t", logline: "l", beats: [], spec: "s", state: "outline-kept", at: "x" } as never }), setEpisodeState: async () => ({}) as never });
    await expect(dueEpisode("brief", "F1-11")).rejects.toThrow(Refusal);
    await expect(dueEpisode("brief", "F1-11")).rejects.toThrow(/started as a production/);

    const id = asId(p.id);
    // Rough is refused before a hero take has landed.
    const refused = await requestTake({ id, kind: "rough", frames: [], mode: "dry", by: "op", actor: OP, dryOnly: true });
    expect(refused.ok ? "ok" : refused.error.message).toBe("production: a rough cut cannot be rendered from accepted");

    const { jobId, takeId } = await launch({ id, kind: "hero", frames: ["panel-1", "panel-2"], mode: "dry", by: "op", actor: OP, dryOnly: true });
    expect(jobId).toBe("job:production-take:prdn:title-f1-11:take-1");
    const rendering = take(id, takeId);
    expect(rendering.take).toMatchObject({ state: "rendering", seed: takeSeed(p.id, 1), engine: "minimax-h3-fl2v-turbo", dry: true, frames: ["panel-1", "panel-2"], beats: ["b1"] });
    expect(rendering.take.prompt).toBe("prompt 1 The shot ends on: prompt 2");
    expect(rendering.production.stage).toBe("hero");

    const run = await driveTake(store, LOC, jobId, { dryOnly: true });
    if (!run.ok) throw run.error;
    expect(run.value.outcome).toBe("done");
    const ready = take(id, takeId);
    expect(ready.take).toMatchObject({ state: "ready", dry: true, gpuSeconds: 0 });
    expect(ready.take.video).toMatch(/^\/api\/blob\/[0-9a-f]{64}\?type=video/);
    expect(ready.take.poster).toMatch(/^\/api\/blob\/[0-9a-f]{64}\?type=image/);

    const agent = await markProven({ id, takeId, by: "athena", actor: "agent" });
    expect(agent.ok ? "ok" : agent.error.message).toBe("production: only the operator may move a production to proven (agent tried, from hero)");

    const stand = await markProven({ id, takeId, by: "op" });
    expect(stand.ok ? "ok" : stand.error.message).toMatch(/is a dry stand-in; no render ran/);

    const backward = await moveProduction({ id, to: "accepted", by: "op", actor: "operator" });
    expect(backward.ok ? "ok" : backward.error.message).toBe("production: hero -> accepted is not a legal move");
  });

  it("renders hero through the fake live engine with its seed and frames, and a rough cut per beat through the fake cutter", async () => {
    const started = await startProduction({ source: { kind: "codex-board", ref: "2026-11-08/S1-90" }, by: "op" });
    if (!started.ok) throw started.error;
    const id = asId(started.value.id);
    const seeds: number[] = [];
    let n = 0;
    const engines = {
      clip: async (i: { first: { bytes: Uint8Array }; last?: { bytes: Uint8Array }; prompt: string; seed: number; width: number; height: number }) => {
        seeds.push(i.seed);
        expect(i.width).toBe(1280);
        return { bytes: MP4(++n), durationS: 5.17 };
      },
      cut: async (clips: readonly string[], out: string) => {
        expect(clips.length).toBe(2);
        writeFileSync(out, MP4(50));
        return { durationS: 10.34 };
      },
    };
    const heroLaunch = await launch({ id, kind: "hero", frames: ["panel-1"], prompt: "a slow push in", mode: "live", by: "op", actor: OP, dryOnly: false });
    const hero = await driveTake(store, LOC, heroLaunch.jobId, { dryOnly: false, engines });
    if (!hero.ok) throw hero.error;
    expect(hero.value.outcome).toBe("done");
    expect(take(id, heroLaunch.takeId).take).toMatchObject({ state: "ready", prompt: "a slow push in", seed: takeSeed(id, 1), durationS: 5.17 });
    expect(take(id, heroLaunch.takeId).take.dry).toBeUndefined();

    const rough = await launch({ id, kind: "rough", frames: [], mode: "live", by: "op", actor: OP, dryOnly: false });
    const cut = await driveTake(store, LOC, rough.jobId, { dryOnly: false, engines });
    if (!cut.ok) throw cut.error;
    expect(cut.value.outcome).toBe("done");
    expect(take(id, rough.takeId).take).toMatchObject({ state: "ready", kind: "rough", durationS: 10.34, frames: ["panel-1", "panel-2"] });
    expect(seeds).toEqual([takeSeed(id, 1), takeSeed(id, 2), takeSeed(id, 2)]);
  });

  it("a failed live clip fails the take with its sentence, and a stale receipt gets a fresh one instead of a launch", async () => {
    const started = await startProduction({ source: { kind: "outline", ref: "2026-10-23-2/c-08" }, by: "op" });
    if (!started.ok) throw started.error;
    const id = asId(started.value.id);
    const heroInput = { id, kind: "hero" as const, frames: ["panel-1"], mode: "live" as const, by: "op", actor: OP, dryOnly: false };
    const stale = await requestTake({ ...heroInput, token: "not-the-token" });
    expect(stale.ok && stale.value.kind).toBe("stale");
    const { jobId, takeId } = await launch(heroInput);
    const run = await driveTake(store, LOC, jobId, { dryOnly: false, engines: { clip: async () => { throw new Error("ComfyUI refused the graph"); } } });
    if (!run.ok) throw run.error;
    expect(run.value.outcome).toBe("failed");
    const failed = take(id, takeId).take;
    expect(failed.state).toBe("failed");
    expect(failed.error).toContain("ComfyUI refused the graph");
  });

  it("live is refused under dry-only, by name", async () => {
    const started = await startProduction({ source: { kind: "codex-board", ref: "2026-11-08/S1-90" }, by: "op" });
    if (!started.ok) throw started.error;
    const refused = await launch({ id: asId(started.value.id), kind: "hero", frames: ["panel-1"], mode: "live", by: "op", actor: OP, dryOnly: true }).catch((e: Error) => e.message);
    expect(refused).toMatch(/live is refused/);
  });
});

describe("the wiring", () => {
  it("the worker carries production-take on gpu.local", () => {
    const set = producers();
    if (!set.ok) throw set.error;
    expect(set.value.has("production-take@gpu.local")).toBe(true);
  });

  it("the H3 graph is clips-h3.py's: frames wired, the t2v branch gone, the seed and turbo LoRA set", () => {
    const g = {
      "115": { class_type: "ResolutionSelector", inputs: {} },
      "140:132": { class_type: "ComfyMathExpression", inputs: {} },
      "140:133": { class_type: "PrimitiveFloat", inputs: {} },
      "140:131": { class_type: "X", inputs: { prompt: "old" } },
      "140:139": { class_type: "PrimitiveBoolean", inputs: { value: false } },
      "140:129": { class_type: "RandomNoise", inputs: { noise_seed: 1 } },
      "140:130": { class_type: "CreateVideo", inputs: { fps: 1 } },
      "92": { class_type: "SaveVideo", inputs: { filename_prefix: "x" } },
    };
    const out = setH3Graph(g, { first: "a.png", last: "b.png", prompt: "go", width: 1280, height: 704, seed: 42, prefix: "gravitone/h3-a" });
    expect(out["115"]).toBeUndefined();
    expect(out["140:131"]?.inputs).toMatchObject({ prompt: "go", width: 1280, height: 704, length: 124, first_frame: ["s1", 0], last_frame: ["s2", 0] });
    expect(out["s1"]?.inputs["image"]).toBe("a.png");
    expect(out["s2"]?.inputs["image"]).toBe("b.png");
    expect(out["140:139"]?.inputs["value"]).toBe(true);
    expect(out["140:129"]?.inputs["noise_seed"]).toBe(42);
    expect(out["92"]?.inputs["filename_prefix"]).toBe("gravitone/h3-a");
  });

  it("a one-frame take has no last frame wired", () => {
    const g = { "140:131": { class_type: "X", inputs: {} }, "140:139": { class_type: "PrimitiveBoolean", inputs: {} }, "140:129": { class_type: "RandomNoise", inputs: {} }, "140:130": { class_type: "CreateVideo", inputs: {} }, "92": { class_type: "SaveVideo", inputs: {} } };
    const out = setH3Graph(g, { first: "a.png", prompt: "go", width: 1280, height: 704, seed: 1, prefix: "p" });
    expect(out["140:131"]?.inputs["last_frame"]).toBeUndefined();
    expect(out["s2"]).toBeUndefined();
  });
});
