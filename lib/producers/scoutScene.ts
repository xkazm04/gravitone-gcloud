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
import { modelOptions } from "@gt/kernel/records/options";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { TABLES } from "@gt/kernel/router/tables";
import type { Reader, Store } from "@gt/kernel/store";
import { DEFAULT_CALL_ESTIMATE_USD } from "@gt/producers/extract/units";
import { defineScoutScene, parseSceneRequest, SCENE_REQUEST, SCOUT_SCENE, type SceneRequest } from "@gt/producers/scout-scene/define";

import { generate, recognize } from "../imaging/router.ts";
import { gateHoldUsd } from "../imaging/video/pricing.ts";
import { kernel } from "../kernelProcess.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { pickFrames, SCENE_REPLICAS } from "../foundry/scout/scene.ts";
import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import { CLIP_SECONDS, type CandidateId, type Night, type NightId, type SceneCandidate } from "../foundry/scout/types.ts";
import { checkCandidate, sceneActs, type SceneEngines } from "./scoutSceneActs.ts";
import { effectsFor } from "./extract.ts";
import { LIVE_MOTION } from "./motion.ts";

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
//   replicate-scene  two Nano Banana stills at the table's measured $0.045 (1K).
//   render-clip      one hailuo-03 clip, 5 s, UNPRICED (Leonardo bills credits per generation); it
//                    is HELD at the video gate's $0.75/s = $3.75 (lib/imaging/video/pricing.ts
//                    gateHoldUsd), and lib/imaging/video/clips.ts books the vendor's own figure to
//                    the `video-usd` window when it settles.
// A night's two clips are therefore $7.50 held of its $15. Whether a scene renders a clip is the
// CALLER's (the night's clip cap, WP1's budget): `clip: false` prices no clip line, plans no clip
// step and books nothing to video.

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
  readonly now?: number;
};

export type SceneLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The candidate already has a job that is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/* ── Lanes and prices ─────────────────────────────────────────────────────── */

/** Every lane a scene job can wait on: the worker binds the producer on each. */
export const SCOUT_SCENE_LANES: readonly ResourceLane[] = ["cloud.google", "cloud.leonardo"];
/** The lane of the expensive half: Leonardo's when a clip is asked for, else Gemini's. */
export const sceneLane = (clip: boolean): ResourceLane => (clip ? "cloud.leonardo" : "cloud.google");

const READ_SECONDS = 20;
const CLIP_WAIT_SECONDS = 180;

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

function stillOption(lane: ResourceLane, day: string): Result<ModelOption> {
  const o = modelOptions("frames", day).find((x) => x.provider === "google");
  return o === undefined ? err("internal", "the frames catalog offers no Google image option to price a replica with") : ok({ ...o, lane, label: "replica still" });
}

function clipOption(lane: ResourceLane): ModelOption {
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
type ReadAsk = { readonly mode: ReceiptMode; readonly clip: boolean; readonly ceilingUsd: number; readonly now: number };

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
  const lane = sceneLane(o.clip);
  const read = readOption(lane);
  const still = stillOption(lane, new Date(o.now).toISOString().slice(0, 10));
  if (!still.ok) return still;
  const clip = clipOption(lane);
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
  const ask: ReadAsk = { mode: opts.mode, clip: opts.clip, ceilingUsd: opts.ceilingUsd, now };
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

export type { SceneEngines };
export const LIVE_SCENE_ENGINES: SceneEngines = { recognize, generate, clip: LIVE_MOTION.leonardoClip };

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
  return defineScoutScene(lane, {
    request: (job) => {
      const s = store();
      return s.ok ? sceneRequestOf(s.value, job.id) : s;
    },
    ...sceneActs(o.engines ?? LIVE_SCENE_ENGINES),
  });
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
