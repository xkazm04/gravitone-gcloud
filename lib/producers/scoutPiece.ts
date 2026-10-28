import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
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
import type { Reader, Store } from "@gt/kernel/store";
import { defineScoutPiece, parsePieceRequest, PIECE_REQUEST, SCOUT_PIECE, type PieceRequest } from "@gt/producers/scout-piece/define";

import { LTX_DEFAULTS, LTX_MODEL } from "../imaging/video/comfyLtx.ts";
import { kernel } from "../kernelProcess.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import { CLIP_SECONDS, parseCellId, type CandidateId, type Night, type NightId, type PieceCandidate, type StoryboardCandidate } from "../foundry/scout/types.ts";
import { effectsFor } from "./extract.ts";
import { pieceActs, type PieceActEngines } from "./scoutPieceActs.ts";

// THE SCOUT PIECE PRODUCER, BOUND (spark scout-vision S2) - one `piece` candidate as one kernel job
// (packages/producers/src/scout-piece/define.ts says which steps and why one clip's failure is not the piece's). This
// file is the launch - receipt, then confirm - and the binding; the acts are ./scoutPieceActs.ts, the act that writes
// the candidate lib/foundry/scout/piece.ts.
//
// WHAT A PIECE COSTS ON ITS RECEIPT: up to two lines on gpu.local - `clip`, one LTX-2.5 clip per index the operator
// rejected on the trial (or that failed there), the scene's measured local clip (lib/producers/scoutScene.ts); and
// `cut`, one ffmpeg concat on this box, illustrative seconds. $0 both, "free: a local model"; no spend row is booked,
// and no job ceiling (the night's ceiling caps Gemini only).
//
// ONE JOB PER PIECE, on gpu.local, naming the `comfy` engine so the worker admits it by that engine's measured profile:
// `job:scout-piece:<night>:<c-NN>`. night.json names it on the candidate and on `night.jobs` once the job exists.

export type PieceTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchPieceOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type PieceLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The piece already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export const SCOUT_PIECE_LANE: ResourceLane = "gpu.local";

/** Wall seconds of one local LTX clip on the card alone, measured (scoutScene.ts LOCAL_CLIP_SECONDS). */
const CLIP_SECONDS_WALL = 101;
/** Wall seconds of one cut of up to five 5 s clips through ffmpeg's libx264 veryfast: illustrative. */
const CUT_SECONDS = 20;

const local = { src: "real" as const, note: "free: a local tool on this box; no vendor is paid" };

function clipOption(): ModelOption {
  return {
    key: `scout-piece/comfyui/${LTX_MODEL}`,
    lane: SCOUT_PIECE_LANE,
    provider: "comfyui",
    model: LTX_MODEL,
    label: `piece clip · ${CLIP_SECONDS} s · local`,
    secondsPerUnit: CLIP_SECONDS_WALL,
    usdPerUnit: 0,
    src: "real",
    basis: { seconds: { src: "real", measuredAt: "2026-10-22", note: `one LTX-2.5 distilled clip at ${LTX_DEFAULTS.width}x${LTX_DEFAULTS.height}, ComfyUI alone on the card (lynx-bench)` }, usd: local },
  };
}

function cutOption(): ModelOption {
  return {
    key: "scout-piece/ffmpeg/concat",
    lane: SCOUT_PIECE_LANE,
    provider: "ffmpeg",
    model: "concat",
    label: "piece cut · local",
    secondsPerUnit: CUT_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "a libx264 veryfast re-encode of at most 25 s of clips, not yet measured here" }, usd: local },
  };
}

/** A re-made clip's seed, from the PIECE's place: a new take, never the trial's rejected seed again. */
export function pieceClipSeed(t: PieceTarget, k: number): number {
  return Number.parseInt(createHash("sha256").update(`scout:${t.nightId}:${t.candidateId}:clip-${k}`).digest("hex").slice(0, 8), 16);
}

/**
 * The piece's clips, one per trial panel: REUSE the trial's clip where it stands and the operator did not reject its
 * cell (`c-NN/clip-N`, a cell still open on a remainder counts as not rejected); RE-MAKE it where it was rejected, or
 * failed (null). A panel that drew no still has nothing to make. Pure.
 */
export function pieceClipsOf(trialNight: Pick<Night, "committed">, trial: StoryboardCandidate, t: PieceTarget): PieceRequest["clips"] {
  const k0 = trialNight.committed;
  const open = new Set(k0?.open ?? []);
  const rejected = new Set((k0?.rejected ?? []).filter((cell) => !open.has(cell) && parseCellId(cell)?.candidate === trial.id));
  return trial.panels.map((prompt, i) => {
    const k = i + 1;
    const still = trial.images?.[i] ?? null;
    const clip = trial.clips?.[i] ?? null;
    const reuse = clip !== null && !rejected.has(`${trial.id}/clip-${k}`);
    return { k, still, prompt, seed: pieceClipSeed(t, k), remake: !reuse, ...(reuse ? { reuse: clip.path } : {}) };
  });
}

/* ── The candidate a launch may price ─────────────────────────────────────── */

/** Why `cid` cannot be launched as a piece in `night`; the candidate when it can. */
export function checkPiece(night: Night, cid: string, mode: ReceiptMode): Result<PieceCandidate> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry) return err("refused", `night ${night.id} is dry; its pieces are words only and cut nothing`);
  if (mode !== "live") return err("refused", `a piece is rendered and cut live on this box (free); a ${mode} receipt makes none`);
  const c = night.candidates.find((x) => x.id === cid);
  if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
  if (c.kind !== "piece") return err("refused", `${cid} is a ${c.kind} candidate, not a piece`);
  if (c.status === "rendered") return err("refused", `${cid} is already rendered`);
  return ok(c);
}

function nightOf(id: NightId): Result<Night> {
  try {
    return ok(readNightNow(id));
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 400 ? "invalid" : "unavailable", e.message);
    throw e;
  }
}

/** The kept trial a piece renders, from its `fromTrial` `<night>/<c-id>`. */
function trialOf(ref: string): Result<{ readonly night: Night; readonly trial: StoryboardCandidate }> {
  const cut = ref.lastIndexOf("/");
  const n = nightOf(ref.slice(0, cut));
  if (!n.ok) return n;
  const trial = n.value.candidates.find((c): c is StoryboardCandidate => c.id === ref.slice(cut + 1) && c.kind === "storyboard");
  if (trial === undefined) return err("not-found", `no trial ${ref}`);
  return ok({ night: n.value, trial });
}

/* ── The receipt ──────────────────────────────────────────────────────────── */

type Unsigned = Omit<PieceRequest, "by">;

function readIn(r: Reader, t: PieceTarget, o: { readonly mode: ReceiptMode; readonly now: number }): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const c = checkPiece(night.value, t.candidateId, o.mode);
  if (!c.ok) return c;
  const tr = trialOf(c.value.fromTrial);
  if (!tr.ok) return tr;
  const clips = pieceClipsOf(tr.value.night, tr.value.trial, t);
  const remake = clips.filter((x) => x.remake && x.still !== null).length;
  // The key names the piece AT its plan: a re-judged trial is a different line.
  const at = `piece:${t.nightId}/${t.candidateId}@${createHash("sha256").update(JSON.stringify(clips)).digest("hex").slice(0, 12)}`;
  const clipLine: PlanLine = { key: `${at}/clip`, label: `clip · ${remake} re-made`, lane: SCOUT_PIECE_LANE, units: remake, option: clipOption(), after: [], order: 0, status: "pending" };
  const cutLine: PlanLine = { key: `${at}/cut`, label: `cut · ${clips.length} clip(s)`, lane: SCOUT_PIECE_LANE, units: 1, option: cutOption(), after: remake > 0 ? [clipLine.key] : [], order: 1, status: "pending" };
  const lines = remake > 0 ? [clipLine, cutLine] : [cutLine];
  const receipt = receiptFor({ subject: { kind: "run", lane: "video" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const aspect = tr.value.trial.aspect === "9:16" ? "9:16" : "16:9";
  return ok({ receipt, request: { nightId: t.nightId, candidateId: t.candidateId, trial: { nightId: tr.value.night.id, candidateId: tr.value.trial.id }, aspect, clips, estimates: { clip: { seconds: CLIP_SECONDS_WALL, usd: 0 }, cut: { seconds: CUT_SECONDS, usd: 0 } } } });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export const pieceJobId = (t: PieceTarget): string => `job:scout-piece:${t.nightId}:${t.candidateId}`;

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The piece's receipt (no token), or its confirm - lib/producers/scoutStoryboard.ts `launchStoryboard`'s contract. */
export async function launchPiece(store: Store, target: PieceTarget, opts: LaunchPieceOptions): Promise<Result<PieceLaunch>> {
  const now = opts.now ?? Date.now();
  const jobId = pieceJobId(target);
  const held = jobOf(store, jobId);
  if (held !== undefined) return ok({ kind: "existing", jobId, state: held.state });
  const ask = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<PieceLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `piece receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/${target.candidateId}` }, producer: SCOUT_PIECE, lane: SCOUT_PIECE_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: PIECE_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  await mutateNight(target.nightId, (n) => {
    const c = n.candidates.find((x) => x.id === target.candidateId && x.kind === "piece");
    if (c === undefined) return n;
    const m = withCandidate(n, { ...c, jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** The request a piece job carries: the event its launch wrote beside the enqueue. */
export function pieceRequestOf(store: Store, jobId: string): Result<PieceRequest> {
  const page = queryEvents(store, { type: [PIECE_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no piece request`) : parsePieceRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Production's engines are the acts' defaults (LTX on this box's ComfyUI, ffmpeg); a test hands fakes. */
export function scoutPieceProducer(o: { readonly store?: () => Result<Store>; readonly engines?: PieceActEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineScoutPiece(SCOUT_PIECE_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? pieceRequestOf(s.value, job.id) : s;
    },
    ...pieceActs(o.engines ?? {}),
  });
  // A re-made clip renders through ComfyUI: the job names the `comfy` engine (the storyboard producer's rule).
  return { ...p, engine: "comfy" };
}

/** Drive one piece job on this process (pipeline/scout.mts after a launch, a test): the worker's rules. */
export function drivePiece(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: PieceActEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutPieceProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
