import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { TABLES } from "@gt/kernel/router/tables";
import type { Reader, Store } from "@gt/kernel/store";
import { DEFAULT_CALL_ESTIMATE_USD } from "@gt/producers/extract/units";
import { defineScoutScene, parseSceneRequest, SCENE_REQUEST, SCOUT_SCENE, type SceneRequest } from "@gt/producers/scout-scene/define";

import { PRICES } from "../imaging/pricing.ts";
import { generate, recognize } from "../imaging/router.ts";
import { LTX_DEFAULTS, LTX_MODEL, renderLtxClip } from "../imaging/video/comfyLtx.ts";
import { gateHoldUsd } from "../imaging/video/pricing.ts";
import { kernel } from "../kernelProcess.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { pickFrames, SCENE_REPLICAS } from "../foundry/scout/scene.ts";
import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import { CLIP_SECONDS, type CandidateId, type Night, type NightId, type SceneCandidate } from "../foundry/scout/types.ts";
import { checkCandidate, CLIP_ENGINES, sceneActs, type ClipEngine, type SceneEngines } from "./scoutSceneActs.ts";
import { effectsFor } from "./extract.ts";
import { LIVE_MOTION, type ClipRequest, type RenderedClip } from "./motion.ts";

// THE SCOUT SCENE PRODUCER, BOUND (spark media-training-loop WP2) - a scene candidate's acts as
// one kernel job (packages/producers/src/scout-scene/define.ts says why one job and which lane):
// read the source keyframes into a SceneRecipe (words), draw replica stills from those words, and,
// when the launch asked for one, animate OUR first replica into a clip. The acts themselves are
// ./scoutSceneActs.ts; the engine they share (prompt, recipe door, clip-source guard, stand-ins)
// is lib/foundry/scout/scene.ts. This file is the launch - receipt, then confirm - and the binding.
//
// WHAT A SCENE COSTS ON ITS RECEIPT. Three lines, each a pre-call figure the job's ceiling is
// checked against before every step (kernel job-core `next`), and none of them a price nobody has:
//   read-scene       one recognize per keyframe (3-5). gemini-3.6-flash is UNPRICED in the kernel
//                    table (its per-token rate is unread); a call is admitted at extract's $0.002
//                    pre-call estimate and booked at what the router reports.
//   replicate-scene  two GPT Image 2.5 Flare stills on Leonardo (lib/foundry/scout/scene.ts
//                    `replicaRequest` prefers `leonardo-flare`), LOW, at lib/imaging/pricing.ts's
//                    per-image fallback ($0.01542, 6 credits); the API's reported credits win.
//   render-clip      by `SCOUT_CLIP_ENGINE` (operator, 2026-10-22: video on a LOCAL model, tagged free):
//                    `ltx-local` (the default) - LTX-2.5 distilled through the ComfyUI on this box
//                    (lib/imaging/video/comfyLtx.ts), $0, no spend row, and the whole job waits on
//                    `gpu.local` (capacity 1: one GPU job at a time across the kernel);
//                    `hailuo` - one hailuo-03 clip on Leonardo, 5 s, UNPRICED (credits per
//                    generation), HELD at the video gate's $0.75/s = $3.75 (lib/imaging/video/
//                    pricing.ts gateHoldUsd); lib/imaging/video/clips.ts books the vendor's figure
//                    to the `video-usd` window when it settles.
// With local clips the night's clip cap limits GPU minutes, not money. Whether a scene renders a
// clip is the CALLER's (the night's clip cap, WP1's budget): `clip: false` prices no clip line,
// plans no clip step and books nothing to video.
//
// ONE JOB, ITS LANE THE SCARCE HALF'S. A local clip makes the card the scarce thing, so the
// scene's reads and stills run under the gpu.local slot too - a minute or two of cloud calls
// while the card idles, against splitting a candidate into two jobs that the night, the budget
// and the Board would all have to learn to pair. The lane names the engine: the clip act renders
// locally on gpu.local and on Leonardo anywhere else, so the request carries no second field to
// drift from it.

export type SceneTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchSceneOptions = {
  readonly mode: ReceiptMode;
  /** The night's remaining money (lib/foundry/scout/budget.ts), the job's ceiling. */
  readonly ceilingUsd: number;
  /** False once the night's clip cap is spent: the job reads and replicates, and renders no clip. */
  readonly clip: boolean;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  /** Absent: `SCOUT_CLIP_ENGINE` (default `ltx-local`). */
  readonly clipEngine?: ClipEngine;
  readonly now?: number;
};

export type SceneLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The candidate already has a job that is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/* ── Lanes and prices ─────────────────────────────────────────────────────── */

/** `SCOUT_CLIP_ENGINE`, unset meaning `ltx-local`; any other word is refused with the two it may be. */
export function clipEngineFrom(env: Readonly<Record<string, string | undefined>> = process.env): Result<ClipEngine> {
  const v = env["SCOUT_CLIP_ENGINE"]?.trim() ?? "";
  if (v === "") return ok("ltx-local");
  const known = CLIP_ENGINES.find((e) => e === v);
  return known === undefined ? err("invalid", `SCOUT_CLIP_ENGINE=${v} names no clip engine; it is ${CLIP_ENGINES.join(" or ")}`) : ok(known);
}

/**
 * Every lane a scene job can wait on: the worker binds the producer on each. cloud.google stays
 * bound for a scene enqueued before the stills moved to Leonardo (2026-10-22); nothing new goes there.
 */
export const SCOUT_SCENE_LANES: readonly ResourceLane[] = ["cloud.google", "cloud.leonardo", "gpu.local"];
/**
 * The lane of the scarce half: the card for a local clip; otherwise Leonardo's, whose Flare stills
 * (and a hosted clip) outweigh the Gemini reads by an order of magnitude.
 */
export const sceneLane = (clip: boolean, engine: ClipEngine = "ltx-local"): ResourceLane => (clip && engine === "ltx-local" ? "gpu.local" : "cloud.leonardo");

const READ_SECONDS = 20;
const CLIP_WAIT_SECONDS = 180;
/** Wall seconds of one local clip on the card alone, measured (pipeline/video/ltx-i2v-api.md "Timing"). */
const LOCAL_CLIP_SECONDS = 101;

function readOption(lane: ResourceLane): ModelOption {
  const model = TABLES.image.candidates.find((c) => c.provider === "google")?.models["recognize"] ?? "recognize";
  const note = `a hold, not a price: google/${model} is unpriced in the kernel table; a recognize call is admitted at extract's $${DEFAULT_CALL_ESTIMATE_USD.recognize} pre-call estimate`;
  return {
    key: `scout-scene/google/${model}`,
    lane,
    provider: "google",
    model,
    label: "scene readback · per keyframe",
    secondsPerUnit: READ_SECONDS,
    usdPerUnit: DEFAULT_CALL_ESTIMATE_USD.recognize,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "assumed: one recognize call, extract's 20 s" }, usd: { src: "illustrative", note } },
  };
}

/** Seconds one Flare still takes: the 2026-10-22 smoke's 15 s, with a poll's slack. */
const STILL_SECONDS = 20;

/** A replica still on GPT Image 2.5 Flare: the router's `leonardo-flare` row, priced at its per-image fallback. */
function stillOption(lane: ResourceLane): Result<ModelOption> {
  const model = TABLES.image.candidates.find((c) => c.provider === "leonardo-flare")?.models["generate"];
  const price = PRICES.find((p) => p.provider === "leonardo-flare" && p.model === model)?.usdPerImage;
  if (model === undefined || price === undefined) return err("internal", "the router table or the price table has no leonardo-flare row to price a replica still with");
  const note = `the per-image fallback (6 credits at USD_PER_CREDIT 0.00257); measured 15 s / 6 credits at LOW 1376x768, 2026-10-22 smoke; the API's reported credits replace it when booked`;
  return ok({
    key: `scout-scene/leonardo-flare/${model}`,
    lane,
    provider: "leonardo-flare",
    model,
    label: "replica still",
    secondsPerUnit: STILL_SECONDS,
    usdPerUnit: price,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "one LOW still, measured 15 s on 2026-10-22, with a poll's slack" }, usd: { src: "illustrative", note } },
  });
}

function clipOption(lane: ResourceLane, engine: ClipEngine): ModelOption {
  if (engine === "ltx-local") {
    return {
      key: `scout-scene/comfyui/${LTX_MODEL}`,
      lane,
      provider: "comfyui",
      model: LTX_MODEL,
      label: `clip · ${CLIP_SECONDS} s · local`,
      secondsPerUnit: LOCAL_CLIP_SECONDS,
      usdPerUnit: 0,
      src: "real",
      basis: {
        seconds: { src: "real", measuredAt: "2026-10-22", note: `one LTX-2.5 distilled clip at ${LTX_DEFAULTS.width}x${LTX_DEFAULTS.height}, upload to download, ComfyUI alone on the card; another session's prompts in its queue stretch it 2-3x (lynx-bench)` },
        usd: { src: "real", note: "free: a local model on this box's card; no vendor is paid" },
      },
    };
  }
  const usd = gateHoldUsd("hailuo-03", CLIP_SECONDS);
  const note = `a hold, not a price: hailuo-03 is unpriced (Leonardo bills credits per generation); the video gate holds $${usd} for ${CLIP_SECONDS} s until the vendor reports`;
  return {
    key: "scout-scene/leonardo/hailuo-03",
    lane,
    provider: "leonardo",
    model: "hailuo-03",
    label: `clip · ${CLIP_SECONDS} s`,
    secondsPerUnit: CLIP_WAIT_SECONDS,
    usdPerUnit: usd,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "assumed: a hosted 5 s clip renders in minutes" }, usd: { src: "illustrative", note } },
  };
}

const estimateOf = (o: ModelOption): SceneRequest["estimates"]["read"] =>
  o.usdPerUnit === null ? { seconds: o.secondsPerUnit, usd: null, unpricedReason: o.unpricedReason ?? "unpriced" } : { seconds: o.secondsPerUnit, usd: o.usdPerUnit };

/* ── The receipt ──────────────────────────────────────────────────────────── */

type Unsigned = Omit<SceneRequest, "by">;
type Read = { readonly receipt: Receipt; readonly request: Unsigned; readonly lane: ResourceLane };
type ReadAsk = { readonly mode: ReceiptMode; readonly clip: boolean; readonly engine: ClipEngine; readonly ceilingUsd: number; readonly now: number };

function nightOf(id: NightId): Result<Night> {
  try {
    return ok(readNightNow(id));
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 400 ? "invalid" : "unavailable", e.message);
    throw e;
  }
}

/** The receipt and the request it prices, read from night.json and the queue (no write). */
function readIn(r: Reader, t: SceneTarget, o: ReadAsk): Result<Read> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const c = checkCandidate(night.value, t.candidateId, o.mode);
  if (!c.ok) return c;
  const keyframes = pickFrames(c.value.keyframes);
  const lane = sceneLane(o.clip, o.engine);
  const read = readOption(lane);
  const still = stillOption(lane);
  if (!still.ok) return still;
  const clip = clipOption(lane, o.engine);
  // The key names the candidate AT its keyframes: a candidate whose keyframes moved since the
  // receipt reads as a different line, so its token goes stale.
  const at = `scene:${night.value.id}/${c.value.id}@${createHash("sha256").update(keyframes.join("\n")).digest("hex").slice(0, 12)}`;
  const line = (part: string, label: string, units: number, option: ModelOption, after: readonly string[], order: number): PlanLine => ({
    key: `${at}/${part}`,
    label,
    lane,
    units,
    option,
    after,
    order,
    status: "pending",
  });
  const lines: PlanLine[] = [
    line("read", `read-scene · ${keyframes.length} keyframe(s)`, keyframes.length, read, [], 0),
    line("replicate", `replicate-scene · ${SCENE_REPLICAS} still(s)`, SCENE_REPLICAS, still.value, [`${at}/read`], 1),
    ...(o.clip ? [line("clip", `render-clip · ${CLIP_SECONDS} s`, 1, clip, [`${at}/replicate`], 2)] : []),
  ];
  const receipt = receiptFor({ subject: { kind: "run", lane: o.clip ? "video" : "image" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode, ceilingUsd: o.ceilingUsd });
  const request: Unsigned = {
    nightId: night.value.id,
    candidateId: c.value.id,
    keyframes,
    replicas: SCENE_REPLICAS,
    clip: o.clip,
    estimates: { read: estimateOf(read), replica: estimateOf(still.value), clip: estimateOf(clip) },
  };
  return ok({ receipt, request, lane });
}

/* ── Jobs of a candidate ──────────────────────────────────────────────────── */

const jobBase = (t: SceneTarget): string => `job:scout-scene:${t.nightId}:${t.candidateId}`;
const jobIdAt = (t: SceneTarget, k: number): string => (k === 1 ? jobBase(t) : `${jobBase(t)}~${k}`);

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The candidate's jobs in launch order: the base id, then `~2`, `~3`... (a relaunch after a failure). */
function jobsOf(store: Store, t: SceneTarget): Job[] {
  const out: Job[] = [];
  for (let k = 1; k < 1000; k++) {
    const j = jobOf(store, jobIdAt(t, k));
    if (j === undefined) return out;
    out.push(j);
  }
  throw new AppError("conflict", `scene ${t.nightId}/${t.candidateId} has launched a thousand times`);
}

const FINISHED: ReadonlySet<Job["state"]> = new Set(["done", "failed", "cancelled"]);

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

/**
 * The scene's receipt (no token), or its confirm. One job per candidate at a time: a candidate
 * whose job is not finished answers `existing`, never a second job. The job id is the
 * candidate's (`job:scout-scene:<night>:<c-NN>`, `~2` after a failed one), and night.json names it
 * on the candidate and on `night.jobs` once the job exists - every later write of the job names it
 * again, so a launch that died between the two is repaired by the job itself.
 */
export async function launchScene(store: Store, target: SceneTarget, opts: LaunchSceneOptions): Promise<Result<SceneLaunch>> {
  const now = opts.now ?? Date.now();
  const prior = jobsOf(store, target);
  const held = prior.at(-1);
  if (held !== undefined && !FINISHED.has(held.state)) return ok({ kind: "existing", jobId: held.id, state: held.state });
  const engine = opts.clipEngine === undefined ? clipEngineFrom() : ok(opts.clipEngine);
  if (!engine.ok) return engine;
  const ask: ReadAsk = { mode: opts.mode, clip: opts.clip, engine: engine.value, ceilingUsd: opts.ceilingUsd, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  if (!(opts.ceilingUsd > 0)) return err("refused", `scene ${target.nightId}/${target.candidateId}: the night has $${opts.ceilingUsd.toFixed(2)} left; nothing is launched against it`);
  const token = opts.token;
  const jobId = jobIdAt(target, prior.length + 1);
  const out = store.tx((t): Result<SceneLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `scene receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/${target.candidateId}` }, producer: SCOUT_SCENE, lane: read.value.lane, mode: mode.value, ceilingUsd: opts.ceilingUsd }, opts.actor);
    append(t, { actor: opts.actor, type: SCENE_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  // A relaunch starts the candidate over: the failed job's error and its partial work go.
  await mutateNight(target.nightId, (n) => {
    const c = n.candidates.find((x): x is SceneCandidate => x.id === target.candidateId && x.kind === "scene");
    if (c === undefined) return n;
    const { error: _e, recipe: _r, clip: _c, clipRequested: _q, ...base } = c;
    const next: SceneCandidate = { ...base, status: "pending", replicas: [], jobId, ...(opts.clip ? { clipRequested: true as const } : {}) };
    const m = withCandidate(n, next);
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export type { ClipEngine, SceneEngines };
export { CLIP_ENGINES };

/** OUR replica, animated on this box; the seed is the candidate's, so a retry renders the same clip. */
async function localClip(req: ClipRequest): Promise<RenderedClip> {
  const seed = Number.parseInt(createHash("sha256").update(req.projectId).digest("hex").slice(0, 8), 16);
  const r = await renderLtxClip({ image: { bytes: new Uint8Array(Buffer.from(req.image.base64, "base64")), mime: req.image.mime }, prompt: req.motion, seed });
  return { bytes: r.bytes, mime: r.mime, model: r.model };
}

export const LIVE_SCENE_ENGINES: SceneEngines = { recognize, generate, clip: LIVE_MOTION.leonardoClip, localClip };

/** The request a scene job carries: the event its launch wrote beside the enqueue. */
export function sceneRequestOf(store: Store, jobId: string): Result<SceneRequest> {
  const page = queryEvents(store, { type: [SCENE_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no scene request`) : parseSceneRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** The producer on one lane; the worker carries one per SCOUT_SCENE_LANES entry (lib/producers/registry.ts). */
export function scoutSceneProducer(lane: ResourceLane, o: { readonly store?: () => Result<Store>; readonly engines?: SceneEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineScoutScene(lane, {
    request: (job) => {
      const s = store();
      return s.ok ? sceneRequestOf(s.value, job.id) : s;
    },
    ...sceneActs(o.engines ?? LIVE_SCENE_ENGINES),
  });
  // A scene on the card renders its clip through ComfyUI (LTX-2.5): it names the `comfy` engine,
  // so the worker ADMITS it by that engine's measured profile against the machine's load
  // (@gt/domain/resource, spark game-3d-assets WP1) - beside a TRELLIS mesh job, not on top of it.
  // On Leonardo's lane it loads nothing on this box and names none.
  return lane === "gpu.local" ? { ...p, engine: "comfy" } : p;
}

/**
 * Drive one scene job on this process (pipeline/scout.mts after a launch, a test): the kernel's own
 * `runJob`, so the lease, the meter, the ceiling and the job's ending are the worker's rules - the
 * same signature as extract's `driveExtract`. A lane busy with another job answers `busy` and the
 * job stays queued for the worker.
 */
export function driveScene(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: SceneEngines } = {}): Promise<Result<RunReport>> {
  const lane = jobOf(store, jobId)?.lane ?? "cloud.google";
  const producer = scoutSceneProducer(lane, { store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
