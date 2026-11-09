import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { blobStore } from "@gt/kernel/blob";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, ActorKind } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import type { Production, ProductionId, ProductionPanel, ProductionSource, ProductionStage, TakeKind } from "@gt/domain/production";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { appendTake, markTakeProven, moveProductionIn, readProduction, refusalOfTake, startProductionIn } from "@gt/kernel/productions/store";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Store } from "@gt/kernel/store";
import { defineProductionTake, parseTakeRequest, PRODUCTION_TAKE, TAKE_REQUEST, type TakeRequest } from "@gt/producers/production-take/define";

import { H3_ENGINE, H3_FRAMES, H3_FPS } from "../imaging/video/comfyH3.ts";
import { conceptBoard } from "../foundry/scout/concepts.ts";
import { blobRootOf, kernel } from "../kernelProcess.ts";
import { effectsFor } from "./extract.ts";
import { takeActs, type TakeEngines } from "./productionActs.ts";

// THE PRODUCTION SEAM (spark concept-casting-stages S1): a kept concept started by the operator, its video iterations
// on gpu.local through the kernel's lease and queue, and the operator's proof. The record is the kernel's
// (@gt/kernel/productions/store); the take's steps are packages/producers/src/production-take/define.ts, its acts
// ./productionActs.ts, and this file is the doors and the binding.
//
// A TAKE COSTS on its receipt one H3 clip per beat on gpu.local (engine comfy, admitted by its measured profile: 1223 s
// for the 124-frame turbo clip alone on the card, .claude/skills/music-clip/SKILL.md) and, for a rough cut, one ffmpeg
// concat; $0 each. Hero first: `rough` is refused until a hero take has landed. Each take is a new job and a new record
// `take-N`; takes are appended, never replaced.

export type StartProductionInput = { readonly source: ProductionSource; readonly title?: string; readonly by: string };

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

function asResult(e: unknown, fallback: "refused" | "unavailable" = "refused"): Result<never> {
  if (e instanceof AppError) return err(e.code, e.message);
  return err(fallback, errorMessage(e));
}

/** Start a kept concept. Nothing starts itself: a press of Start is the only caller, and it is the operator's. */
export async function startProduction(input: StartProductionInput): Promise<Result<Production>> {
  const s = processStore();
  if (!s.ok) return s;
  const store = s.value;
  try {
    const board = await conceptBoard(input.source);
    const blobs = blobStore(blobRootOf(store));
    const panels: ProductionPanel[] = [];
    for (const p of board.panels) {
      const ref = await blobs.put(p.bytes, p.mime);
      if (!ref.ok) return ref;
      panels.push({ id: p.id, beat: p.beat, prompt: p.prompt, still: ref.value });
    }
    return store.tx((t) => startProductionIn(t, { source: input.source, title: input.title?.trim() || board.title, board: { logline: board.logline, aspect: board.aspect, panels } }, { kind: "operator", id: input.by }));
  } catch (e) {
    return asResult(e);
  }
}

export type MoveProductionInput = { readonly id: ProductionId; readonly to: ProductionStage; readonly by: string; readonly actor: ActorKind };

/** One stage move; an illegal one is refused with @gt/domain/production `refusalOfMove`'s sentence. */
export async function moveProduction(input: MoveProductionInput): Promise<Result<Production>> {
  const s = processStore();
  if (!s.ok) return s;
  return s.value.tx((t) => moveProductionIn(t, input.id, input.to, { kind: input.actor, id: input.by }));
}

/** The operator marks one take proven. Agents are refused by the machine, whatever they try. */
export async function markProven(input: { readonly id: ProductionId; readonly takeId: string; readonly by: string; readonly actor?: ActorKind }): Promise<Result<Production>> {
  const s = processStore();
  if (!s.ok) return s;
  return s.value.tx((t) => markTakeProven(t, input.id, input.takeId, { kind: input.actor ?? "operator", id: input.by }));
}

/* ── The take: receipt, then confirm ──────────────────────────────────────── */

export const PRODUCTION_TAKE_LANE: ResourceLane = "gpu.local";
/** Wall seconds of one 124-frame turbo clip alone on the card, measured: .claude/skills/music-clip/SKILL.md (Stay Here C5). */
const CLIP_SECONDS_WALL = 1223;
const CUT_SECONDS = 20;
const local = { src: "real" as const, note: "free: a local tool on this box; no vendor is paid" };

function clipOption(): ModelOption {
  return {
    key: `production-take/comfyui/${H3_ENGINE}`,
    lane: PRODUCTION_TAKE_LANE,
    provider: "comfyui",
    model: H3_ENGINE,
    label: `take clip · ${(H3_FRAMES / H3_FPS).toFixed(1)} s · local`,
    secondsPerUnit: CLIP_SECONDS_WALL,
    usdPerUnit: 0,
    src: "real",
    basis: { seconds: { src: "real", measuredAt: "2026-11-01", note: "one H3 fl2v turbo clip at 1280x704, 124 frames, alone on the card (music-clip Stay Here v5)" }, usd: local },
  };
}

function cutOption(): ModelOption {
  return {
    key: "production-take/ffmpeg/concat",
    lane: PRODUCTION_TAKE_LANE,
    provider: "ffmpeg",
    model: "concat",
    label: "rough cut · local",
    secondsPerUnit: CUT_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "a libx264 veryfast re-encode of up to 26 s of clips, not yet measured here" }, usd: local },
  };
}

export type RequestTakeInput = {
  readonly id: ProductionId;
  readonly kind: TakeKind;
  /** Hero: the panel ids to animate, one or two in order. Rough: ignored, every panel gets a clip. */
  readonly frames: readonly string[];
  /** Hero: the motion line (default: the frame's own prompt, plus the end frame's). Rough: prepended to each beat. */
  readonly prompt?: string;
  readonly mode: ReceiptMode;
  readonly by: string;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type TakeLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly takeId: string; readonly receipt: Receipt };

/** A take's seed, from its place: a retry renders the same clip, a new take a different one. */
export function takeSeed(id: string, n: number): number {
  return Number.parseInt(createHash("sha256").update(`production:${id}:take-${n}`).digest("hex").slice(0, 8), 16);
}

export const takeJobId = (id: string, n: number): string => `job:production-take:${id}:take-${n}`;

type Planned = {
  readonly receipt: Receipt;
  readonly n: number;
  readonly seed: number;
  readonly clips: TakeRequest["clips"];
  readonly beats: readonly string[];
  readonly frames: readonly string[];
};

const trimmed = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t === undefined || t === "" ? undefined : t;
};

function planClips(p: Production, input: RequestTakeInput): TakeRequest["clips"] | string {
  const panels = p.board.panels;
  const panel = (id: string): ProductionPanel | undefined => panels.find((x) => x.id === id);
  if (input.kind === "rough") {
    const prefix = trimmed(input.prompt);
    return panels.map((x, i) => ({ k: i + 1, beat: x.beat, first: x.still, prompt: prefix === undefined ? x.prompt : `${prefix} ${x.prompt}` }));
  }
  if (input.frames.length < 1 || input.frames.length > 2) return "production: a hero take animates one or two frames";
  const first = panel(input.frames[0] ?? "");
  const last = input.frames[1] === undefined ? undefined : panel(input.frames[1]);
  if (first === undefined || (input.frames[1] !== undefined && last === undefined)) return `production: ${input.frames.join(", ")} are not panels of ${p.id}`;
  const prompt = trimmed(input.prompt) ?? (last === undefined ? first.prompt : `${first.prompt} The shot ends on: ${last.prompt}`);
  return [{ k: 1, beat: first.beat, first: first.still, ...(last === undefined ? {} : { last: last.still }), prompt }];
}

function readPlan(r: Parameters<Parameters<Store["read"]>[0]>[0], input: RequestTakeInput, mode: ReceiptMode, now: number): Result<Planned> {
  const p = readProduction(r, input.id);
  if (p === undefined) return err("not-found", `production: no ${input.id}`);
  const why = refusalOfTake(p, input.kind);
  if (why !== undefined) return err("refused", why);
  const clips = planClips(p, input);
  if (typeof clips === "string") return err("refused", clips);
  const n = p.takes.length + 1;
  const key = `take:${p.id}/take-${n}@${createHash("sha256").update(JSON.stringify(clips)).digest("hex").slice(0, 12)}`;
  const clipLine: PlanLine = { key: `${key}/clip`, label: `clip · ${clips.length} H3 clip(s)`, lane: PRODUCTION_TAKE_LANE, units: clips.length, option: clipOption(), after: [], order: 0, status: "pending" };
  const cutLine: PlanLine | undefined = input.kind === "rough" ? { key: `${key}/cut`, label: "cut · rough video", lane: PRODUCTION_TAKE_LANE, units: 1, option: cutOption(), after: [clipLine.key], order: 1, status: "pending" } : undefined;
  const lines = cutLine === undefined ? [clipLine] : [clipLine, cutLine];
  const receipt = receiptFor({ subject: { kind: "run", lane: "video" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now, mode });
  const framesUsed = input.kind === "rough" ? p.board.panels.map((x) => x.id) : input.frames;
  const beats = clips.map((c) => c.beat);
  return ok({ receipt, n, seed: takeSeed(p.id, n), clips, beats, frames: framesUsed });
}

/** The take's receipt (no token), or its confirm: lib/producers/scoutStoryboard.ts `launchStoryboard`'s contract. */
export async function requestTake(input: RequestTakeInput): Promise<Result<TakeLaunch>> {
  const s = processStore();
  if (!s.ok) return s;
  const store = s.value;
  const now = input.now ?? Date.now();
  const first = store.read((r) => readPlan(r, input, input.mode, now));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (input.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = input.token;
  const out = store.tx((t): Result<TakeLaunch> => {
    const read = readPlan(t, input, input.mode, now);
    if (!read.ok) return read;
    const plan = read.value;
    if (plan.receipt.token !== token) return ok({ kind: "stale", fresh: plan.receipt });
    const mode = input.mode === "dry" ? ok(DRY) : armLive(input.actor, t.at, `take receipt ${token.slice(0, 12)} confirmed`, { dryOnly: input.dryOnly });
    if (!mode.ok) return mode;
    const jobId = takeJobId(input.id, plan.n);
    const takeId = `take-${plan.n}`;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `production:${input.id}/${takeId}` }, producer: PRODUCTION_TAKE, lane: PRODUCTION_TAKE_LANE, mode: mode.value }, input.actor);
    const prompt = plan.clips.map((c) => c.prompt).join("\n");
    appendTake(t, input.id, { kind: input.kind, beats: plan.beats, frames: plan.frames, prompt, seed: plan.seed, engine: H3_ENGINE, jobId, dry: input.mode === "dry" }, input.actor);
    const p = readProduction(t, input.id);
    const request: Omit<TakeRequest, "by"> = {
      productionId: input.id,
      takeId,
      kind: input.kind,
      aspect: p?.board.aspect === "9:16" ? "9:16" : "16:9",
      seed: plan.seed,
      clips: plan.clips,
      estimates: { clip: { seconds: CLIP_SECONDS_WALL, usd: 0 }, cut: { seconds: CUT_SECONDS, usd: 0 } },
    };
    append(t, { actor: input.actor, type: TAKE_REQUEST, subject: { kind: "job", id: jobId }, data: { ...request, by: input.by } });
    return ok({ kind: "launched", jobId, takeId, receipt: plan.receipt });
  });
  if (!out.ok) return out;
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** The request a take job carries: the event its launch wrote beside the enqueue. */
export function takeRequestOf(store: Store, jobId: string): Result<TakeRequest> {
  const page = queryEvents(store, { type: [TAKE_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no take request`) : parseTakeRequest(e.data);
}

/** Production's engines are the acts' defaults (H3 on this box's ComfyUI, ffmpeg); a test hands fakes. */
export function productionTakeProducer(o: { readonly store?: () => Result<Store>; readonly engines?: TakeEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineProductionTake(PRODUCTION_TAKE_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? takeRequestOf(s.value, job.id) : s;
    },
    ...takeActs(store, o.engines ?? {}),
  });
  // H3 runs through ComfyUI: the job names the `comfy` engine, so the worker admits it by that engine's measured profile.
  return { ...p, engine: "comfy" };
}

/** Drive one take's job on this process (a test, a CLI): the worker's rules. */
export function driveTake(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: TakeEngines } = {}): Promise<Result<RunReport>> {
  const producer = productionTakeProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}

/** The job behind a take: its state and how far it got; undefined when the job is gone. */
export function jobOfTake(store: Store, jobId: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, jobId);
  if (!parsed.ok) return undefined;
  const r = get(store, parsed.value);
  return r.ok ? r.value.job : undefined;
}
