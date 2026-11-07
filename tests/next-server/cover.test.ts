// A COVER, END TO END (spark track-mirror-studio WP1) over a temp sound store and a temp kernel: the launch's receipt
// and confirm (one job, its request event beside it, a second launch the same job), the refusals with the work's facts,
// and the job driven through a FAKE ComfyUI (fetch stubbed per call) and a fake ffmpeg cut - six steps booked, five takes
// done and the cover judging; a drive stopped after render-2 resumed at render-3; a ComfyUI execution error kept
// verbatim on its take, the others kept, the cover failed. No ComfyUI, no ffmpeg, no vendor: the global fetch throws.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { COVER_TAKE_COUNT, type CoverPlan } from "@gt/domain/cover";
import { ok } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { get } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { COVER_REQUEST } from "@gt/producers/cover/define";

import { coverSeed, driveCover, launchCover } from "../../lib/producers/cover.ts";
import type { CoverActEngines } from "../../lib/producers/coverActs.ts";
import { producers } from "../../lib/producers/registry.ts";
import { coverFileAbs, createCover, listCovers, readCover } from "../../lib/sound/cover/store.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op" };
const ABC = ["X:1", "M:4/4", "K:Bm", "% intro", 'V: Vocal', '"Bm"z16|', "% chorus", "z16|", "% chorus", "z16|"].join("\n");
const OOM = "CUDA out of memory. Tried to allocate 2.00 GiB (GPU 0; 7.99 GiB total capacity)";

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function store(): Store {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  return k.value.store;
}

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** A ComfyUI that answers from memory: SheetSage2 returns ABC, YuE2 a flac named by its seed; `failSeed` fails. */
function fakeComfy(o: { readonly failSeed?: number; readonly afterRender?: (seed: number) => void } = {}) {
  const graphs: Graph[] = [];
  const uploads: string[] = [];
  const history = new Map<string, unknown>();
  const files = new Map<string, Uint8Array>();
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const p = u.pathname;
    if (p === "/upload/image") {
      const f = (init?.body as FormData).get("image") as File;
      uploads.push(f.name);
      return Response.json({ name: f.name, subfolder: "gravitone", type: "input" });
    }
    if (p === "/prompt") {
      const g = (JSON.parse(String(init?.body)) as { prompt: Graph }).prompt;
      graphs.push(g);
      const id = `p${graphs.length}`;
      if (g["3"]?.class_type === "SheetSage2AudioToABC") history.set(id, { status: { status_str: "success", completed: true }, outputs: { "4": { text: [ABC] } } });
      else {
        const seed = Number(g["2"]?.inputs["seed"]);
        if (seed === o.failSeed) history.set(id, { status: { status_str: "error", completed: false, messages: [["execution_start", {}], ["execution_error", { node_id: "2", node_type: "YuE2GenerateMusic", exception_message: `${OOM}\n` }]] }, outputs: {} });
        else {
          const name = `s${seed}_00001_.flac`;
          files.set(name, new Uint8Array([0x66, 0x4c, 0x61, 0x43, seed % 251]));
          history.set(id, { status: { status_str: "success", completed: true }, outputs: { "7": { audio: [{ filename: name, subfolder: "audio/gravitone-cover", type: "output" }] } } });
          o.afterRender?.(seed);
        }
      }
      return Response.json({ prompt_id: id });
    }
    if (p.startsWith("/history/")) {
      const id = decodeURIComponent(p.slice("/history/".length));
      return Response.json(history.has(id) ? { [id]: history.get(id) } : {});
    }
    if (p === "/view") {
      const b = files.get(u.searchParams.get("filename") ?? "");
      return b === undefined ? new Response("no such file", { status: 404 }) : new Response(new Uint8Array(b));
    }
    if (p === "/queue") return Response.json({ queue_running: [], queue_pending: [] });
    return new Response("not here", { status: 404 });
  };
  const renders = () => graphs.filter((g) => g["2"]?.class_type === "YuE2GenerateMusic");
  return { fetch, graphs, uploads, renders };
}

function fakeCut() {
  const cuts: { startS: number; endS: number }[] = [];
  const cut: NonNullable<CoverActEngines["cut"]> = async (_abs, startS, endS, out) => {
    cuts.push({ startS, endS });
    writeFileSync(out, new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]));
    return ok(undefined);
  };
  return { cut, cuts };
}

async function newCover(durationS = 200) {
  return createCover({ title: "Tears", rights: "own", source: { bytes: new Uint8Array([0x49, 0x44, 0x33, 4]), mime: "audio/mpeg", name: "tears.mp3", durationS } });
}

const planOf = (id: string, o: Partial<CoverPlan> = {}): CoverPlan => ({ id, startS: 30, endS: 50, style: "Melancholic lofi hip hop instrumental, 100 BPM", lyrics: "", ...o });

async function launched(id: string): Promise<string> {
  const s = store();
  const r = await launchCover(s, planOf(id), { mode: "live", actor: OP, dryOnly: false });
  if (!r.ok || r.value.kind !== "receipt") throw new Error(`no receipt: ${JSON.stringify(r)}`);
  const c = await launchCover(s, planOf(id), { mode: "live", actor: OP, dryOnly: false, token: r.value.receipt.token });
  if (!c.ok || c.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(c)}`);
  return c.value.jobId;
}

const fast = { backoffMs: () => 0 };

describe("the cover launch", () => {
  it("a launch without a token answers a $0 receipt of six lines and enqueues nothing", async () => {
    const c = await newCover();
    const s = store();
    const r = await launchCover(s, planOf(c.id), { mode: "live", actor: OP, dryOnly: false });
    expect(r.ok && r.value.kind).toBe("receipt");
    if (!r.ok || r.value.kind !== "receipt") return;
    expect(r.value.receipt.subject).toEqual({ kind: "run", lane: "audio" });
    expect(get(s, `job:cover:${c.id}` as never).ok).toBe(false);
    expect((await readCover(c.id))?.state).toBe("draft");
  });

  it("with the token: one gpu.local job of the run cover:<id>, its request event, five pending takes; a second launch answers existing", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const s = store();
    expect(jobId).toBe(`job:cover:${c.id}`);
    const j = get(s, jobId as never);
    expect(j.ok && [j.value.job.producer, j.value.job.lane, j.value.job.of, j.value.job.mode.kind]).toEqual(["cover", "gpu.local", { kind: "run", id: `cover:${c.id}` }, "live"]);
    const ev = queryEvents(s, { type: [COVER_REQUEST], subject: { kind: "job", id: jobId }, limit: 5 });
    expect(ev.ok && ev.value.events.length).toBe(1);
    const seeds = Array.from({ length: COVER_TAKE_COUNT }, (_, i) => coverSeed(c.id, i + 1));
    expect(ev.ok && ev.value.events[0]?.data).toMatchObject({ coverId: c.id, startS: 30, endS: 50, lyrics: "", seeds, max_duration: 360, temperature: 0.8, by: "op" });
    const rec = await readCover(c.id);
    expect([rec?.state, rec?.jobId, rec?.takes.map((t) => [t.n, t.seed, t.state])]).toEqual(["queued", jobId, seeds.map((seed, i) => [i + 1, seed, "pending"])]);
    const again = await launchCover(s, planOf(c.id), { mode: "live", actor: OP, dryOnly: false });
    expect(again.ok && again.value).toEqual({ kind: "existing", jobId });
  });

  it("refuses with the work's facts", async () => {
    const c = await newCover(200);
    const s = store();
    const why = async (p: Partial<CoverPlan>, mode: "live" | "dry" = "live"): Promise<string> => {
      const r = await launchCover(s, planOf(c.id, p), { mode, actor: OP, dryOnly: false });
      return r.ok ? "launched" : r.error.message;
    };
    expect(await why({ startS: 190, endS: 210 })).toBe("section 190-210 s is outside the song's 0-200 s");
    expect(await why({ startS: 10, endS: 15 })).toBe("section 10-15 s is shorter than 10 s");
    const long = await newCover(500);
    const r = await launchCover(s, planOf(long.id, { startS: 0, endS: 400 }), { mode: "live", actor: OP, dryOnly: false });
    expect(!r.ok && r.error.message).toBe("section 0-400 s is longer than 360 s");
    expect(await why({ style: "x".repeat(1001) })).toBe("the style is 1001 characters, over 1000");
    expect(await why({}, "dry")).toBe("a cover renders live on this box's card (free); a dry receipt renders none");
    const none = await launchCover(s, planOf("cov-000000000000"), { mode: "live", actor: OP, dryOnly: false });
    expect(!none.ok && none.error.message).toBe("no cover cov-000000000000");
  });
});

describe("the cover job", () => {
  it("a full drive books six steps, leaves five done takes and the cover judging", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const comfy = fakeComfy();
    const ff = fakeCut();
    const d = await driveCover(store(), LOC, jobId, { dryOnly: false, engines: { cut: ff.cut, comfy: { fetch: comfy.fetch, sleep: async () => undefined } }, run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    expect(ff.cuts).toEqual([{ startS: 30, endS: 50 }]);
    expect(comfy.uploads).toHaveLength(1);
    expect(comfy.uploads[0]).toMatch(new RegExp(`^cover-${c.id}-[0-9a-f]{16}\\.wav$`));
    const transcribe = comfy.graphs[0];
    expect(transcribe?.["1"]?.inputs["audio"]).toBe(`gravitone/${comfy.uploads[0]}`);
    expect(transcribe?.["3"]?.inputs["mode"]).toBe("full");
    const renders = comfy.renders();
    const seeds = Array.from({ length: COVER_TAKE_COUNT }, (_, i) => coverSeed(c.id, i + 1));
    expect(renders.map((g) => g["2"]?.inputs["seed"])).toEqual(seeds);
    expect(renders.map((g) => g["5"]?.inputs["seed"])).toEqual(seeds);
    expect(renders[0]?.["2"]?.inputs).toMatchObject({ abc: ABC, lyrics: "[Intro]\n\n[Chorus]", mode: "full", max_duration: 360, temperature: 0.8, top_p: 0.95, top_k: 100, repetition_penalty: 1.2, cfg_scale: 1 });
    expect(renders[0]?.["5"]?.inputs).toMatchObject({ steps: 32, cfg: 1, sampler_name: "dpm_2", scheduler: "sgm_uniform" });
    const rec = await readCover(c.id);
    expect(rec?.state).toBe("judging");
    expect(rec?.score).toBe("score.abc");
    expect(readFileSync(coverFileAbs(c.id, "score.abc"), "utf8")).toBe(ABC);
    expect(rec?.takes.map((t) => [t.state, t.file])).toEqual(seeds.map((seed) => ["done", `takes/s${seed}.flac`]));
    for (const seed of seeds) expect([...readFileSync(coverFileAbs(c.id, `takes/s${seed}.flac`))].slice(0, 4)).toEqual([0x66, 0x4c, 0x61, 0x43]);
    const j = get(store(), jobId as never);
    expect(j.ok && j.value.job.progress.done).toBe(6);
    expect((await listCovers()).some((x) => x.id === c.id)).toBe(true);
  });

  it("a drive stopped after render-2 resumes at render-3 and renders only 3..5", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    let stop = false;
    const first = fakeComfy({ afterRender: (seed) => (stop = seed === coverSeed(c.id, 2)) });
    const ff = fakeCut();
    const engines = { cut: ff.cut, comfy: { fetch: first.fetch, sleep: async () => undefined } };
    const d1 = await driveCover(store(), LOC, jobId, { dryOnly: false, engines, run: { ...fast, deadlineMs: 1, now: () => (stop ? 2 : 0) } });
    expect(d1.ok && d1.value.outcome).toBe("yielded");
    expect(first.renders()).toHaveLength(2);
    expect((await readCover(c.id))?.takes.map((t) => t.state)).toEqual(["done", "done", "pending", "pending", "pending"]);
    const second = fakeComfy();
    const d2 = await driveCover(store(), LOC, jobId, { dryOnly: false, engines: { cut: ff.cut, comfy: { fetch: second.fetch, sleep: async () => undefined } }, run: fast });
    expect(d2.ok && d2.value.outcome).toBe("done");
    expect(second.graphs.some((g) => g["3"]?.class_type === "SheetSage2AudioToABC")).toBe(false);
    expect(second.renders().map((g) => g["2"]?.inputs["seed"])).toEqual([3, 4, 5].map((n) => coverSeed(c.id, n)));
    expect(ff.cuts).toHaveLength(1);
    expect((await readCover(c.id))?.state).toBe("judging");
  });

  it("a ComfyUI execution error fails its take with ComfyUI's sentence verbatim, keeps the others, and fails the cover", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const bad = coverSeed(c.id, 3);
    const comfy = fakeComfy({ failSeed: bad });
    const d = await driveCover(store(), LOC, jobId, { dryOnly: false, engines: { cut: fakeCut().cut, comfy: { fetch: comfy.fetch, sleep: async () => undefined } }, run: fast });
    expect(d.ok && d.value.outcome).toBe("failed");
    const rec = await readCover(c.id);
    expect(rec?.state).toBe("failed");
    expect(rec?.takes.map((t) => t.state)).toEqual(["done", "done", "failed", "pending", "pending"]);
    expect(rec?.takes[2]?.error).toBe(OOM);
    expect(existsSync(coverFileAbs(c.id, `takes/s${coverSeed(c.id, 1)}.flac`))).toBe(true);
    const j = get(store(), jobId as never);
    expect(j.ok && j.value.job.error?.message).toContain(OOM);
  });

  it("the store refuses a file outside the cover's folder", async () => {
    const c = await newCover();
    expect(() => coverFileAbs(c.id, "../other/cover.json")).toThrow(/outside cover/);
    expect(() => coverFileAbs(c.id, path.resolve(ROOT, "x"))).toThrow(/outside cover/);
    expect(coverFileAbs(c.id, "takes/s1.flac").startsWith(path.join(ROOT, "sound", "covers", c.id))).toBe(true);
  });

  it("the producer is registered on gpu.local", () => {
    const set = producers();
    expect(set.ok && set.value.has("cover@gpu.local" as never)).toBe(true);
  });
});
