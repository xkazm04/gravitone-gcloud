// THE SCENE PRODUCER AS A JOB (spark media-training-loop WP2) - launchScene's receipt -> token
// two-step and driveScene over a temp kernel store and a temp night (SCOUT_STORE_DIR and
// GRAVITONE_STORE_PATH are set below, before any lib/ module loads). No vendor is reached: a dry
// job is answered by the stand-ins, and the engines it is handed throw if called; the live drives
// use fakes that report what a vendor would, and record what they were sent. Both clip engines are
// driven: `ltx-local` (the default, this box's ComfyUI, free, on gpu.local) and `hailuo` (Leonardo).

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-scene-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  // The still engine's default is pinned here, whatever the operator's shell carries.
  delete process.env["SCOUT_REPLICA_GENERATOR"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { AppError } from "@gt/domain/errors";
import { get } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { meterOf } from "@gt/kernel/spend/projection";
import { producerSet } from "@gt/producers/set";

import { createNight, mutateNight, nightDir, readNight } from "../../lib/foundry/scout/store.ts";
import type { SceneCandidate, ScoutSource } from "../../lib/foundry/scout/types.ts";
import { ImagingError } from "../../lib/imaging/errors.ts";
import type { GeneratedImages, Recognition } from "../../lib/imaging/types.ts";
import type { ClipRequest } from "../../lib/producers/motion.ts";
import type { ReplicaGenerator } from "../../lib/foundry/scout/stillEngine.ts";
import { clipEngineFrom, driveScene, launchScene, SCOUT_SCENE_LANES, scoutSceneProducer, type ClipEngine, type SceneEngines, type SceneLaunch, type SceneTarget } from "../../lib/producers/scoutScene.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
let k: Kernel;
beforeAll(() => {
  const r = openKernel(LOC);
  if (!r.ok) throw r.error;
  k = r.value;
});
afterAll(() => {
  k.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const OP: Actor = { kind: "operator", id: "op-1" };
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

const KEYFRAMES = ["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg", "sources/s-01/k-003.jpg"];
const SOURCE: ScoutSource = {
  id: "s-01",
  url: "https://example.test/watch?v=1",
  kind: "video",
  title: "Harbour Chase - Official Trailer",
  channel: "Moonfall Pictures",
  why: "a held wide shot against fast cutting",
  found: "search",
  rights: "reference-only",
  status: "ingested",
  files: KEYFRAMES,
  durationS: 10,
  at: { [KEYFRAMES[0] ?? ""]: 1, [KEYFRAMES[1] ?? ""]: 2.5, [KEYFRAMES[2] ?? ""]: 4 },
};

/** A night holding one ingested video source and one scene candidate over its first two keyframes. */
async function seed(dry: boolean): Promise<SceneTarget> {
  const n = await createNight({ dry, day: "2026-10-22" });
  for (const [i, f] of KEYFRAMES.entries()) {
    const abs = path.join(nightDir(n.id), f);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, `source keyframe ${i + 1}`);
  }
  const c: SceneCandidate = { id: "c-01", kind: "scene", sourceIds: ["s-01"], status: "pending", keyframes: KEYFRAMES.slice(0, 2), replicas: [] };
  await mutateNight(n.id, (x) => ({ ...x, sources: [SOURCE], candidates: [c] }));
  return { nightId: n.id, candidateId: "c-01" };
}

const sceneOf = async (t: SceneTarget): Promise<SceneCandidate> => {
  const c = (await readNight(t.nightId)).candidates.find((x) => x.id === t.candidateId);
  if (c?.kind !== "scene") throw new Error("no scene");
  return c;
};
const jobOf = (id: string): Job => must(get(k.store, jobIdSchema.parse(id))).job;
const fileOf = (t: SceneTarget, rel: string): string => path.join(nightDir(t.nightId), rel);

const calls = { recognize: 0, generate: 0, clip: 0, localClip: 0 };
const NEVER: SceneEngines = {
  recognize: async () => {
    calls.recognize++;
    throw new Error("a dry scene reached the recognizer");
  },
  generate: async () => {
    calls.generate++;
    throw new Error("a dry scene reached the image vendor");
  },
  clip: async () => {
    calls.clip++;
    throw new Error("a dry scene reached the video vendor");
  },
  localClip: async () => {
    calls.localClip++;
    throw new Error("a dry scene reached the card");
  },
};

type Mode = "dry" | "live";
/** `generator` absent: Flare, the engine these lanes and prices were pinned on; null: the process default (the studio). */
async function launch(t: SceneTarget, o: { clip: boolean; mode?: Mode; ceilingUsd?: number; engine?: ClipEngine; generator?: ReplicaGenerator | null }): Promise<{ receipt: Extract<SceneLaunch, { kind: "receipt" }>["receipt"]; jobId: string }> {
  const mode = o.mode ?? "dry";
  const generator = o.generator === undefined ? "leonardo-flare" : o.generator;
  const base = { mode, ceilingUsd: o.ceilingUsd ?? 15, clip: o.clip, actor: OP, dryOnly: mode === "dry", ...(o.engine === undefined ? {} : { clipEngine: o.engine }), ...(generator === null ? {} : { generator }) };
  const r = must(await launchScene(k.store, t, base));
  if (r.kind !== "receipt") throw new Error(`expected a receipt, got ${r.kind}`);
  const l = must(await launchScene(k.store, t, { ...base, token: r.receipt.token }));
  if (l.kind !== "launched") throw new Error(`expected a launch, got ${l.kind}`);
  return { receipt: r.receipt, jobId: l.jobId };
}

it("binds as the worker carries it: one producer per lane a scene can wait on", () => {
  const set = must(producerSet(SCOUT_SCENE_LANES.map((lane) => ({ name: "scout-scene" as const, producer: scoutSceneProducer(lane) }))));
  expect([...set.keys()].sort()).toEqual(["scout-scene@box.chrome", "scout-scene@cloud.google", "scout-scene@cloud.leonardo", "scout-scene@gpu.local"]);
});

it("reads the clip engine from SCOUT_CLIP_ENGINE: unset is ltx-local, an unknown word is refused", () => {
  expect(clipEngineFrom({})).toEqual({ ok: true, value: "ltx-local" });
  expect(clipEngineFrom({ SCOUT_CLIP_ENGINE: "hailuo" })).toEqual({ ok: true, value: "hailuo" });
  const bad = clipEngineFrom({ SCOUT_CLIP_ENGINE: "wan" });
  expect(bad.ok ? "" : bad.error.message).toBe("SCOUT_CLIP_ENGINE=wan names no clip engine; it is ltx-local or hailuo");
});

describe("a dry scene, end to end", () => {
  it("on a local clip: waits on gpu.local, prices the clip at $0, and its dry would-call names ComfyUI, never the card", async () => {
    const t = await seed(true);
    const { receipt, jobId } = await launch(t, { clip: true, generator: null });
    expect(receipt.lines.map((l) => [l.label, l.lane, l.provider, l.model, l.usd])).toEqual([
      ["read-scene · 2 keyframe(s)", "gpu.local", "google", expect.any(String), 0],
      ["replicate-scene · 2 still(s)", "gpu.local", "leonardo-studio", expect.any(String), null],
      ["render-clip · 5 s", "gpu.local", "comfyui", "ltx-2.5-distilled", 0],
    ]);
    expect(jobOf(jobId).lane).toBe("gpu.local");
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.at(-1)).toMatchObject({ provider: "comfyui", model: "ltx-2.5-distilled" });
    expect(calls).toEqual({ recognize: 0, generate: 0, clip: 0, localClip: 0 });
    expect((await sceneOf(t)).clip).toEqual({ path: "scenes/c-01/clip.mp4", durationS: 5, from: "scenes/c-01/replica-1.jpg", engine: "ltx-local", usd: 0 });
  });

  it("prices read, replicas and a held clip, launches one job, and leaves every cell's stand-in", async () => {
    const t = await seed(true);
    const { receipt, jobId } = await launch(t, { clip: true, engine: "hailuo" });
    expect(receipt.subject).toEqual({ kind: "run", lane: "video" });
    expect(receipt.lines.map((l) => [l.label, l.lane, l.usd])).toEqual([
      ["read-scene · 2 keyframe(s)", "cloud.leonardo", 0],
      ["replicate-scene · 2 still(s)", "cloud.leonardo", 0.03],
      ["render-clip · 5 s", "cloud.leonardo", 3.75],
    ]);
    expect(receipt.ceilingUsd).toBe(15);
    expect(jobId).toBe(`job:scout-scene:${t.nightId}:c-01`);

    // The night names the job and counts the clip it asked for.
    const night = await readNight(t.nightId);
    expect(night.jobs).toEqual([jobId]);
    expect(await sceneOf(t)).toMatchObject({ jobId, clipRequested: true, status: "pending" });

    // A second launch of an unfinished candidate is that job, never a second one.
    const again = must(await launchScene(k.store, t, { mode: "dry", ceilingUsd: 15, clip: true, actor: OP, dryOnly: true, clipEngine: "hailuo" }));
    expect(again).toEqual({ kind: "existing", jobId, state: "queued" });

    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.map((w) => [w.provider, w.model])).toEqual([
      ["imaging-router", "recognize"],
      ["imaging-router", "recognize"],
      ["imaging-router", "generate"],
      ["imaging-router", "generate"],
      ["leonardo", "hailuo-03"],
    ]);
    expect(calls).toEqual({ recognize: 0, generate: 0, clip: 0, localClip: 0 });

    const c = await sceneOf(t);
    expect(c.status).toBe("rendered");
    expect(c.error).toBeUndefined();
    // The stand-in recipe, its length and pace read off the source's cut timestamps.
    expect(c.recipe).toMatchObject({ shot: "medium", durationS: 3, rhythm: "4 shots over 10 s, median 1.5 s, 24 cuts a minute; this shot holds 3 s" });
    expect(c.replicas).toEqual(["scenes/c-01/replica-1.jpg", "scenes/c-01/replica-2.jpg"]);
    for (const r of c.replicas) expect(existsSync(fileOf(t, r))).toBe(true);
    expect(c.clip).toEqual({ path: "scenes/c-01/clip.mp4", durationS: 5, from: "scenes/c-01/replica-1.jpg", engine: "hailuo" });
    expect(readFileSync(fileOf(t, "scenes/c-01/clip.mp4"), "utf8")).toBe("dry-run clip stand-in");
    expect(jobOf(jobId).state).toBe("done");
  });

  it("with clip:false prices no clip, plans no clip step, books nothing to video and renders no clip", async () => {
    const t = await seed(true);
    const { receipt, jobId } = await launch(t, { clip: false });
    expect(receipt.subject).toEqual({ kind: "run", lane: "image" });
    expect(receipt.lines.map((l) => l.label)).toEqual(["read-scene · 2 keyframe(s)", "replicate-scene · 2 still(s)"]);
    // Flare stills at the per-image fallback ($0.01542 each); the job waits on Leonardo's lane, the stills' half.
    expect(receipt.totals.usd).toBe(0.03);
    expect(jobOf(jobId).lane).toBe("cloud.leonardo");
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.some((w) => w.provider === "leonardo")).toBe(false);
    const c = await sceneOf(t);
    expect(c).toMatchObject({ status: "rendered", replicas: ["scenes/c-01/replica-1.jpg", "scenes/c-01/replica-2.jpg"] });
    expect(c.clip).toBeUndefined();
    expect(c.clipRequested).toBeUndefined();
    expect(existsSync(fileOf(t, "scenes/c-01/clip.mp4"))).toBe(false);
  });

  it("stops at the job's ceiling before a clip it cannot afford: the stills stand, rendered, and the clip's sentence is kept", async () => {
    const t = await seed(true);
    const { jobId } = await launch(t, { clip: true, ceilingUsd: 1, engine: "hailuo" });
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("failed");
    const c = await sceneOf(t);
    expect(c.status).toBe("rendered");
    expect(c.error).toMatch(/^clip: Run ceiling reached: .* clip is estimated at \$3\.7500/);
    expect(c.replicas).toHaveLength(2);
    expect(c.recipe).toBeDefined();
    expect(c.clip).toBeUndefined();
    expect(c.clipRequested).toBe(true);
  });

  it("refuses a live launch inside a dry night before anything is priced", async () => {
    const t = await seed(true);
    const r = await launchScene(k.store, t, { mode: "live", ceilingUsd: 15, clip: true, actor: OP, dryOnly: false });
    expect(r.ok ? null : r.error.message).toMatch(/is dry; a live scene would spend on a packet that commits nothing$/);
  });
});

/* ── live, on fakes ───────────────────────────────────────────────────────── */

const GOOD = {
  shot: "wide",
  camera: "low and level, the figure on the left third, a wide lens with the near edge stretched",
  motion: "camera pushes in slowly; rain drifts right to left; the figure holds",
  composition: "one figure against a long receding line of lamps, open water on the right",
  lighting: "a hard sodium key from frame right; everything left of the figure falls to black",
  palette: [
    { colour: "teal", job: "ground" },
    { colour: "sodium amber", job: "light" },
  ],
  rhythm: "held long against quick cutting around it",
  duration_s: 4,
  prompt: "A photoreal film still: a wide low shot of a lone figure in a long coat on a wet quay at night, a hard amber key from the right, teal air, the left of frame falling to black.",
};

const PNG = (seed: number): string => Buffer.from(`replica pixels ${seed}`).toString("base64");

function fakes(o: { answer?: unknown; onGenerate?: (seed: number) => Promise<void>; clipError?: Error } = {}): { engines: SceneEngines; sent: { clips: ClipRequest[]; recognized: number; generated: number } } {
  // Both engines record into `clips`: which one was called is read off the job's lane and the candidate.
  const sent = { clips: [] as ClipRequest[], recognized: 0, generated: 0 };
  const engines: SceneEngines = {
    recognize: async (): Promise<Recognition> => {
      sent.recognized++;
      return { text: "", json: o.answer ?? GOOD, provenance: { provider: "google", model: "gemini-3.6-flash", modelBasis: "requested", durationMs: 0, costUsd: 0.001, costBasis: "estimated" } };
    },
    generate: async (req): Promise<GeneratedImages> => {
      sent.generated++;
      await o.onGenerate?.(req.seed ?? 0);
      return { images: [{ base64: PNG(req.seed ?? 0), mime: "image/png" }], provenance: { provider: "google", model: "gemini-3.1-flash-image", modelBasis: "requested", durationMs: 0, costUsd: 0.045, costBasis: "estimated" } };
    },
    clip: async (req) => {
      sent.clips.push(req);
      if (o.clipError !== undefined) throw o.clipError;
      return { bytes: new TextEncoder().encode("mp4 bytes"), mime: "video/mp4", model: "hailuo-03", costUsd: 1.2 };
    },
    localClip: async (req) => {
      sent.clips.push(req);
      if (o.clipError !== undefined) throw o.clipError;
      return { bytes: new TextEncoder().encode("local mp4 bytes"), mime: "video/mp4", model: "ltx-2.5-distilled" };
    },
  };
  return { engines, sent };
}

describe("a live scene, on fakes", () => {
  it.each(["hailuo", "ltx-local"] as const)("%s animates OUR first replica: the engine is sent the replica's bytes, never a keyframe's", async (engine) => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live", engine });
    expect(jobOf(jobId).lane).toBe(engine === "hailuo" ? "cloud.leonardo" : "gpu.local");
    const f = fakes();
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("done");
    expect(f.sent).toMatchObject({ recognized: 2, generated: 2 });
    expect(f.sent.clips).toHaveLength(1);
    const sentImage = f.sent.clips[0]?.image.base64;
    expect(sentImage).toBe(PNG(1));
    for (const kf of KEYFRAMES) expect(sentImage).not.toBe(readFileSync(fileOf(t, kf)).toString("base64"));
    expect(f.sent.clips[0]).toMatchObject({ projectId: `scout:${t.nightId}:c-01`, aspect: "16:9" });
    const c = await sceneOf(t);
    expect(c).toMatchObject({ status: "rendered", replicas: ["scenes/c-01/replica-1.png", "scenes/c-01/replica-2.png"], clip: { path: "scenes/c-01/clip.mp4", from: "scenes/c-01/replica-1.png", engine, usd: engine === "hailuo" ? 1.2 : 0 } });
    expect(c.recipe?.palette).toEqual(["teal ground", "sodium amber light"]);
    expect(readFileSync(fileOf(t, "scenes/c-01/clip.mp4"), "utf8")).toBe(engine === "hailuo" ? "mp4 bytes" : "local mp4 bytes");
    // The local clip books nothing: the job's spend is its two reads and two stills, and no unpriced row stands for the clip.
    const meter = k.store.read((r) => meterOf(r, jobId));
    expect(meter.ok ? [meter.value.usd, meter.value.unpriced] : null).toEqual(engine === "hailuo" ? [1.292, 0] : [0.092, 0]);
  });

  // A clip failure keeps the stills - but not when the "stills" include a source frame: that
  // candidate is failed, so a source frame can never be kept as a replica either.
  it.each(["hailuo", "ltx-local"] as const)("%s: a keyframe smuggled into the replicas is refused at the clip step; the engine is never called", async (engine) => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live", engine });
    // After the first replica lands, night.json is rewritten so the first "replica" is a source frame.
    const f = fakes({
      onGenerate: async (seed) => {
        if (seed === 2) await mutateNight(t.nightId, (n) => ({ ...n, candidates: n.candidates.map((c) => (c.kind === "scene" ? { ...c, replicas: [KEYFRAMES[0] ?? ""] } : c)) }));
      },
    });
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("failed");
    expect(f.sent.clips).toHaveLength(0);
    const c = await sceneOf(t);
    expect(c.status).toBe("failed");
    expect(c.error).toBe("c-01: sources/s-01/k-001.jpg is a source file (reference-only); it never reaches a video vendor");
    expect(c.clip).toBeUndefined();
  });

  it("a recipe that names its source fails the candidate with the door's sentence, and no still is paid for", async () => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live" });
    const f = fakes({ answer: { ...GOOD, composition: "the harbour wall on the right, one figure on the left" } });
    expect(jobOf(jobId).lane).toBe("gpu.local");
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("failed");
    expect(f.sent).toMatchObject({ recognized: 1, generated: 0 });
    expect(f.sent.clips).toHaveLength(0);
    const c = await sceneOf(t);
    expect(c.status).toBe("failed");
    expect(c.error).toBe('c-01 keyframe 1/2: the scene recipe names "harbour" (the source\'s title or channel): craft, not content');
    expect(c.replicas).toEqual([]);
    expect(c.recipe).toBeUndefined();
  });
  it("a local clip ComfyUI fails leaves the scene rendered with its stills, no clip, and ComfyUI's sentence", async () => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live" });
    const said = "ComfyUI SamplerCustomAdvanced (node 452:428) failed: Allocation on device would exceed allowed memory.";
    const f = fakes({ clipError: new AppError("unavailable", said) });
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("failed");
    expect(f.sent.clips).toHaveLength(1);
    const c = await sceneOf(t);
    expect(c).toMatchObject({ status: "rendered", error: `clip: ${said}`, clipRequested: true, replicas: ["scenes/c-01/replica-1.png", "scenes/c-01/replica-2.png"] });
    expect(c.clip).toBeUndefined();
  });

  it("a clip the vendor refuses leaves the scene rendered with its stills, no clip, and the vendor's sentence", async () => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live", engine: "hailuo" });
    const said = "the moderation filter refused this generation";
    const f = fakes({ clipError: new ImagingError(said, "refused", "leonardo") });
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("failed");
    expect(f.sent.clips).toHaveLength(1);
    const c = await sceneOf(t);
    expect(c).toMatchObject({ status: "rendered", error: `clip: ${said}`, clipRequested: true, replicas: ["scenes/c-01/replica-1.png", "scenes/c-01/replica-2.png"] });
    expect(c.recipe).toBeDefined();
    expect(c.clip).toBeUndefined();
  });

  it("a replica the vendor refuses fails the scene, and no clip is asked for", async () => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: true, mode: "live" });
    const said = "the subject was refused by the image vendor";
    const f = fakes({
      onGenerate: async (seed) => {
        if (seed === 2) throw new ImagingError(said, "refused", "google");
      },
    });
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines: f.engines }));
    expect(report.outcome).toBe("failed");
    expect(f.sent.clips).toHaveLength(0);
    const c = await sceneOf(t);
    expect(c.status).toBe("failed");
    expect(c.error).toBe(said);
    expect(c.replicas).toEqual(["scenes/c-01/replica-1.png"]);
    expect(c.clip).toBeUndefined();
  });
});

/* ── the still engine: the lane and the price are the stills' engine's ─────── */

describe("a scene's still engine (spark scout-vision S6)", () => {
  it("by default draws on the studio: the job waits on box.chrome, its replicas unpriced in studio credits, and it runs under its ceiling", async () => {
    const t = await seed(true);
    const { receipt, jobId } = await launch(t, { clip: false, generator: null });
    expect(receipt.lines.map((l) => [l.label, l.lane, l.provider, l.usd])).toEqual([
      ["read-scene · 2 keyframe(s)", "box.chrome", "google", 0],
      ["replicate-scene · 2 still(s)", "box.chrome", "leonardo-studio", null],
    ]);
    expect(jobOf(jobId).lane).toBe("box.chrome");
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("done");
    expect(calls).toEqual({ recognize: 0, generate: 0, clip: 0, localClip: 0 });
  });

  it("a live studio replica asks for the studio at Low, and books it unpriced", async () => {
    const t = await seed(false);
    const { jobId } = await launch(t, { clip: false, mode: "live", generator: "leonardo-studio" });
    const asked: { prefer?: string; quality?: string; aspect?: string }[] = [];
    const f = fakes();
    const engines: SceneEngines = {
      ...f.engines,
      generate: async (req) => {
        asked.push({ prefer: req.prefer, quality: req.quality, aspect: req.aspect });
        return { images: [{ base64: PNG(req.seed ?? 0), mime: "image/png" }], provenance: { provider: "leonardo-studio", model: "gpt-image-2.5-sunburst", modelBasis: "requested", durationMs: 0, costBasis: "unpriced" } };
      },
    };
    const report = must(await driveScene(k.store, LOC, jobId, { dryOnly: false, engines }));
    expect(report.outcome).toBe("done");
    expect(asked).toEqual([
      { prefer: "leonardo-studio", quality: "low", aspect: "16:9" },
      { prefer: "leonardo-studio", quality: "low", aspect: "16:9" },
    ]);
    const meter = k.store.read((r) => meterOf(r, jobId));
    expect(meter.ok ? [meter.value.usd, meter.value.unpriced] : null).toEqual([0.002, 2]);
  });

  it("comfy-flux2 waits on gpu.local, admitted by the comfy engine, its stills free", async () => {
    const t = await seed(true);
    const { receipt, jobId } = await launch(t, { clip: false, generator: "comfy-flux2" });
    expect(receipt.lines.map((l) => [l.label, l.lane, l.provider, l.usd])).toEqual([
      ["read-scene · 2 keyframe(s)", "gpu.local", "google", 0],
      ["replicate-scene · 2 still(s)", "gpu.local", "comfy-flux2", 0],
    ]);
    expect(jobOf(jobId).lane).toBe("gpu.local");
    expect(scoutSceneProducer("gpu.local").engine).toBe("comfy");
  });

  it("comfy-flux2 replicas with a hosted clip are refused: no lane holds both", async () => {
    const t = await seed(true);
    const r = await launchScene(k.store, t, { mode: "dry", ceilingUsd: 15, clip: true, clipEngine: "hailuo", generator: "comfy-flux2", actor: OP, dryOnly: true });
    expect(r.ok ? null : r.error.message).toMatch(/comfy-flux2 replicas and a hailuo clip share no lane/);
  });
});
