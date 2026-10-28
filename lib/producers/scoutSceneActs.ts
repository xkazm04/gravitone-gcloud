import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ReceiptMode } from "@gt/domain/produce";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import { readStep, type ScenePorts, type SceneRequest } from "@gt/producers/scout-scene/define";

import { ImagingError } from "../imaging/errors.ts";
import type { GeneratedImages, GenerateRequest, ImageRef, Recognition, RecognizeRequest } from "../imaging/types.ts";
import { LTX_MODEL } from "../imaging/video/comfyLtx.ts";
import { VideoError } from "../imaging/video/errors.ts";
import {
  clipFile,
  clipRequestOf,
  denylistOf,
  draftOf,
  DRY_CLIP,
  frameInstruction,
  imageMimeOf,
  recipeOf,
  replicaFile,
  replicaRequest,
  SCENE_SCHEMA,
  scenePrompt,
  sceneTiming,
  standDraft,
  standStill,
  type SceneDraft,
} from "../foundry/scout/scene.ts";
import { generatorOnLane } from "../foundry/scout/stillEngine.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import { CLIP_SECONDS, type Night, type SceneCandidate, type SceneClip } from "../foundry/scout/types.ts";
import { imageFailure } from "./frames.ts";
import type { ClipRequest, RenderedClip } from "./motion.ts";

// THE SCENE'S ACTS - the three ports of packages/producers/src/scout-scene/define.ts over the
// imaging router, the video hop and the night store, and the candidate check a launch makes
// before anything is priced. Every vendor call is DECLARED to the step's meter (`meteredCall`):
// a dry job is answered by the stand-ins of lib/foundry/scout/scene.ts and books a would-call,
// and its files are written exactly as a live job's would be, so a dry night's packet has every
// cell. Every outcome writes the candidate through `mutateNight` + `withCandidate`, fenced
// against the job's slot first (extract's `stillHeld`): a drive that lost its slot writes nothing.

/** The vendors a scene calls; a test hands fakes, never the routers. */
export type SceneEngines = {
  readonly recognize: (req: RecognizeRequest) => Promise<Recognition>;
  readonly generate: (req: GenerateRequest) => Promise<GeneratedImages>;
  /** Leonardo image-to-video (hailuo-03, 5 s), awaited to its terminal state (lib/producers/motion.ts). */
  readonly clip: (req: ClipRequest) => Promise<RenderedClip>;
  /** LTX-2.5 image-to-video on this box's ComfyUI (lib/imaging/video/comfyLtx.ts): free, 5 s. */
  readonly localClip: (req: ClipRequest) => Promise<RenderedClip>;
};

/** What renders a scene's clip: `ltx-local` on this box's ComfyUI (free, no spend row), `hailuo` on Leonardo. */
export const CLIP_ENGINES = ["ltx-local", "hailuo"] as const;
export type ClipEngine = (typeof CLIP_ENGINES)[number];
/** A clip as the candidate records it, its engine named (SceneClip `engine`, lib/foundry/scout/types.ts). */
type ClipRecord = SceneClip & { readonly engine: ClipEngine };

type Fatal = "not-found" | "refused" | "invalid" | "unavailable" | "internal";
const fatal = (code: Fatal, message: string): StepOutcome => ({ kind: "fatal", code, message });
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

/* ── The candidate a launch may price ─────────────────────────────────────── */

/** Why `cid` cannot be launched as a scene in `night`, in the work's words; the candidate when it can. */
export function checkCandidate(night: Night, cid: string, mode: ReceiptMode): Result<SceneCandidate> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry && mode === "live") return err("refused", `night ${night.id} is dry; a live scene would spend on a packet that commits nothing`);
  const c = night.candidates.find((x) => x.id === cid);
  if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
  if (c.kind !== "scene") return err("refused", `${cid} is a ${c.kind} candidate, not a scene`);
  if (c.status === "rendered") return err("refused", `${cid} is already rendered`);
  if (c.keyframes.length === 0) return err("refused", `${cid} has no keyframes to read`);
  for (const f of c.keyframes) {
    const src = night.sources.find((s) => c.sourceIds.includes(s.id) && s.files.includes(f));
    if (src === undefined) return err("refused", `${cid}: ${f} is not a file of its sources`);
    if (src.status !== "ingested") return err("refused", `${cid}: source ${src.id} is ${src.status}`);
    if (imageMimeOf(f) === undefined) return err("refused", `${cid}: ${f} is not a png, jpeg or webp keyframe`);
  }
  return ok(c);
}

/* ── Night IO ─────────────────────────────────────────────────────────────── */

async function load(req: SceneRequest): Promise<{ readonly night: Night; readonly c: SceneCandidate }> {
  const night = await readNight(req.nightId);
  const c = night.candidates.find((x): x is SceneCandidate => x.id === req.candidateId && x.kind === "scene");
  if (c === undefined) throw new AppError("not-found", `no scene ${req.candidateId} in night ${req.nightId}`);
  return { night, c };
}

/** Throws when this drive no longer holds its slot: asked before every night write. */
function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

/** One candidate write: `fn` over the candidate as it is NOW, the job named on it and on `night.jobs`. */
async function writeCandidate(req: SceneRequest, jobId: string, fn: (c: SceneCandidate) => SceneCandidate): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find((x): x is SceneCandidate => x.id === req.candidateId && x.kind === "scene");
    if (c === undefined) return n;
    const m = withCandidate(n, { ...fn(c), jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
}

async function writeFileAt(req: SceneRequest, rel: string, bytes: Uint8Array): Promise<void> {
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
}

async function imageAt(req: SceneRequest, rel: string): Promise<ImageRef> {
  const mime = imageMimeOf(rel);
  if (mime === undefined) throw new AppError("refused", `${rel} is not a png, jpeg or webp picture`);
  return { base64: (await readFile(resolveInNight(req.nightId, rel))).toString("base64"), mime };
}

/* ── read-scene ───────────────────────────────────────────────────────────── */

async function readAct(e: SceneEngines, req: SceneRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const { night, c } = await load(req);
  const file = req.keyframes[k - 1];
  if (file === undefined) return fatal("internal", `${c.id} has no keyframe ${k} on its request`);
  const n = req.keyframes.length;
  const timing = sceneTiming(night, { ...c, keyframes: req.keyframes });
  // Our own kept idea (rights `ours`) is not a found source: its title is our words, and a recipe read
  // off our own artboard may say them (spark scout-idea-artboards WP-I4).
  const deny = denylistOf(night.sources.filter((s) => c.sourceIds.includes(s.id) && s.rights !== "ours"));
  const prior: SceneDraft[] = [];
  for (let i = 1; i < k; i++) {
    const d = draftOf(ctx.outputs.get(readStep(i))?.value["draft"], deny);
    if (!d.ok) return fatal("internal", `${c.id}: the booked reading of keyframe ${i} no longer passes the door (${d.error.message})`);
    prior.push(d.value);
  }
  // The keyframe is read in a dry job too: a rehearsal that never opened the file proves nothing.
  const image = await imageAt(req, file);
  const instruction = frameInstruction(await scenePrompt(), { k, of: n, file, prior, timing });
  let dry = false;
  const raw = await meteredCall<unknown>(ctx, {
    provider: "imaging-router",
    model: "recognize",
    payload: { instruction, keyframe: file, schema: SCENE_SCHEMA },
    estimate: req.estimates.read,
    stand: () => {
      dry = true;
      return standDraft(timing);
    },
    live: async () => {
      const r = await e.recognize({ image, instruction, schema: SCENE_SCHEMA, prefer: "google" });
      const p = r.provenance;
      return { value: r.json, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for a scene readback` } : { usd: p.costUsd }) };
    },
  });
  const where = `${c.id} keyframe ${k}/${n}`;
  const draft = draftOf(raw, deny);
  // A name is the candidate's end (nothing is drawn from a recipe that names its source); a
  // malformed answer is the vendor's, and the breaker counts it.
  if (!draft.ok) return draft.error.code === "refused" ? fatal("refused", `${where}: ${draft.error.message}`) : { kind: "vendor-failure", message: `${where}: ${draft.error.message}` };
  if (k === n) {
    const recipe = recipeOf(raw, { deny, timing });
    if (!recipe.ok) return fatal("refused", `${where}: ${recipe.error.message}`);
    fence(ctx);
    await writeCandidate(req, ctx.job.id, (x) => ({ ...x, recipe: recipe.value }));
  }
  return madePaid(data({ frame: k, keyframe: file, draft: draft.value, dry }), ctx);
}

/* ── replicate-scene ──────────────────────────────────────────────────────── */

async function replicateAct(e: SceneEngines, req: SceneRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const { c } = await load(req);
  if (c.recipe === undefined) return fatal("refused", `${c.id} has no recipe to replicate`);
  // The engine is the lane's where the lane names one (stillEngine.ts `generatorOnLane`): the launch priced it.
  const gen = replicaRequest(c.recipe, k, generatorOnLane(ctx.job.lane));
  const got = await meteredCall<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }>(ctx, {
    provider: "imaging-router",
    model: "generate",
    // No `references`: the replica is drawn from the recipe's words alone.
    payload: { prompt: gen.prompt, negativePrompt: gen.negativePrompt, aspect: gen.aspect, count: gen.count, prefer: gen.prefer, seed: gen.seed, ...(gen.quality === undefined ? {} : { quality: gen.quality }) },
    estimate: req.estimates.replica,
    stand: () => ({ images: [standStill()] }),
    live: async () => {
      const out = await e.generate(gen);
      const p = out.provenance;
      return { value: { images: out.images, provenance: p }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the replica still` } : { usd: p.costUsd }) };
    },
  });
  const img = got.images[0];
  if (img === undefined) return { kind: "vendor-failure", message: `${c.id} replica ${k}: the imaging router answered with no image` };
  const rel = replicaFile(c.id, k, img.mime);
  fence(ctx);
  await writeFileAt(req, rel, new Uint8Array(Buffer.from(img.base64, "base64")));
  const mine = `scenes/${c.id}/replica-${k}.`;
  // In step order, so replica-1 is first: the still a clip animates (scene.ts `clipRequestOf`).
  await writeCandidate(req, ctx.job.id, (x) => ({ ...x, replicas: [...x.replicas.filter((r) => !r.startsWith(mine)), rel] }));
  const p = got.provenance;
  return madePaid(data({ replica: k, file: rel, dry: p === undefined, ...(p === undefined ? {} : { model: p.model, provider: p.provider, ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }) }) }), ctx);
}

/* ── render-clip ──────────────────────────────────────────────────────────── */

/**
 * THE ENGINE IS THE LANE'S (lib/producers/scoutScene.ts `sceneLane`): a job on gpu.local renders
 * on this box, any other on Leonardo. A LOCAL CLIP IS FREE, so a live one is not a paid call: it
 * is made directly, books no spend row, and the step reports $0 (`madePaid` with an unused meter).
 * A dry one is still declared, so a dry job never reaches the card and its would-calls name the
 * engine it would have used.
 */
async function clipAct(e: SceneEngines, req: SceneRequest, ctx: StepContext): Promise<StepOutcome> {
  const { night, c } = await load(req);
  // THE GUARD: the clip's image is whatever `clipRequestOf` lets through, and nothing else is read.
  const ask = clipRequestOf(night, c);
  if (!ask.ok) return fatal("refused", ask.error.message);
  const { from, motion } = ask.value;
  const image = await imageAt(req, from);
  const engine: ClipEngine = ctx.job.lane === "gpu.local" ? "ltx-local" : "hailuo";
  const local = engine === "ltx-local";
  const send: ClipRequest = { projectId: `scout:${night.id}:${c.id}`, image, motion, aspect: "16:9" };
  const clip =
    local && ctx.job.mode.kind === "live"
      ? await e.localClip(send)
      : await meteredCall<RenderedClip>(ctx, {
          provider: local ? "comfyui" : "leonardo",
          model: local ? LTX_MODEL : "hailuo-03",
          payload: { from, motion, aspect: "16:9", durationS: CLIP_SECONDS },
          estimate: req.estimates.clip,
          stand: () => ({ bytes: DRY_CLIP, mime: "video/mp4", model: "dry stand-in" }),
          live: async () => {
            const r = await e.clip(send);
            return { value: r, ...(r.costUsd === undefined ? { unpriced: "the clip vendor reported no cost; it stays held at its estimate" } : { usd: r.costUsd }) };
          },
        });
  const usd = local ? 0 : clip.costUsd;
  const rel = clipFile(c.id);
  fence(ctx);
  await writeFileAt(req, rel, clip.bytes);
  const record: ClipRecord = { path: rel, durationS: CLIP_SECONDS, from, engine, ...(usd === undefined ? {} : { usd }) };
  await writeCandidate(req, ctx.job.id, (x) => ({ ...x, clip: record }));
  return madePaid(data({ clip: rel, from, engine, provider: local ? "comfyui" : "leonardo", model: clip.model, dry: clip.model === "dry stand-in", ...(usd === undefined ? {} : { costUsd: usd }) }), ctx);
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/**
 * The candidate told how its job ended: `rendered` once every step is booked, `failed` with the
 * job's own sentence (the vendor's, the door's, a ceiling's) verbatim. An interruption or an
 * operator's stop leaves it pending - the job may yet be retried. A candidate a newer job owns is
 * left to that job.
 *
 * A FAILED CLIP DOES NOT FAIL THE SCENE (Director's ruling, WP2 review): when the recipe and every
 * replica landed and only the clip did not - a vendor refusal, a money stop before it, any clip
 * error - the candidate is `rendered` with its stills keepable, no `clip`, `clipRequested` kept
 * (the night's cap counts the asking), and the clip's sentence verbatim in `error` after `clip: `.
 * "Every replica" means this candidate's own files only: a replica list that holds anything else
 * (a source frame written into night.json) is the failure it looks like, never a rendered scene.
 */
async function ended(req: SceneRequest, job: Job, ending: string): Promise<void> {
  if (ending !== "done" && ending !== "failed") return;
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find((x): x is SceneCandidate => x.id === req.candidateId && x.kind === "scene");
    if (c === undefined || (c.jobId !== undefined && c.jobId !== job.id)) return n;
    const { error: _e, ...rest } = c;
    const said = job.error?.message ?? `job ${job.id} failed`;
    const own = (r: string): boolean => r.startsWith(`scenes/${c.id}/replica-`);
    const clipOnly = req.clip && c.recipe !== undefined && c.clip === undefined && c.replicas.length === req.replicas && c.replicas.every(own);
    const next: SceneCandidate =
      ending === "done"
        ? { ...rest, status: "rendered", jobId: job.id }
        : clipOnly
          ? { ...rest, status: "rendered", jobId: job.id, error: `clip: ${said}` }
          : { ...rest, status: "failed", jobId: job.id, error: said };
    const m = withCandidate(n, next);
    return m.jobs.includes(job.id) ? m : { ...m, jobs: [...m.jobs, job.id] };
  });
}

/** A thrown act, classified: a video gate's money refusal is a money stop, a refused subject the job's sentence. */
function caught(x: unknown): StepOutcome {
  if (x instanceof VideoError) return x.kind === "over-budget" ? { kind: "money-stop", message: x.message } : fatal("unavailable", x.message);
  if (x instanceof ImagingError && x.kind === "refused") return fatal("refused", x.message);
  return imageFailure(x);
}

const guarded =
  <A extends unknown[]>(act: (...a: A) => Promise<StepOutcome>) =>
  async (...a: A): Promise<StepOutcome> => {
    try {
      return await act(...a);
    } catch (x) {
      return caught(x);
    }
  };

export function sceneActs(e: SceneEngines): Pick<ScenePorts, "read" | "replicate" | "clip" | "ended"> {
  return {
    read: guarded((req: SceneRequest, k: number, ctx: StepContext) => readAct(e, req, k, ctx)),
    replicate: guarded((req: SceneRequest, k: number, ctx: StepContext) => replicateAct(e, req, k, ctx)),
    clip: guarded((req: SceneRequest, ctx: StepContext) => clipAct(e, req, ctx)),
    ended,
  };
}
