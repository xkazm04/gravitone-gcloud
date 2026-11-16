import { createHash } from "node:crypto";

import { COVER_LYRICS_MAX, COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, COVER_STYLE_MAX, COVER_TAKE_COUNT, type CoverLaunch, type CoverPlan, type CoverRecord } from "@gt/domain/cover";
import { coverIdSchema } from "@gt/domain/cover.schema";
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
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { COVER, COVER_MAX_DURATION, COVER_REQUEST, COVER_TEMPERATURE, defineCover, parseCoverRequest, renderStep, TRANSCRIBE_STEP, type CoverRequest } from "@gt/producers/cover/define";

import { kernel } from "../kernelProcess.ts";
import { mutateCover, readCover } from "../sound/cover/store.ts";
import { SHEETSAGE2_ENCODER, YUE2_CHECKPOINT } from "../sound/cover/yue2.ts";
import { coverActs, type CoverActEngines } from "./coverActs.ts";
import { effectsFor } from "./extract.ts";

// THE COVER PRODUCER, BOUND (spark track-mirror-studio) - one cover as one kernel job of six steps
// (packages/producers/src/cover/define.ts says which). This file is the launch - receipt, then confirm - and the
// binding; the acts are ./coverActs.ts.
//
// WHAT A COVER COSTS ON ITS RECEIPT: six lines on gpu.local - transcribe, then render-1..5 in order - each $0, "free: a
// local model", its seconds illustrative: stage 1's measurement on this box (docs/concepts/yue2-audio-experiments-2026-11-06.md:
// a 120 s reference transcribed in 6.3 s, a fresh 32-step render in 47.9 s), rounded up to 10 s and 60 s. No job ceiling.
//
// ONE JOB PER COVER, on gpu.local, naming the `comfy` engine: `job:cover:<id>`, of the run `cover:<id>`. cover.json names
// it once the job exists, with its five takes pending.

export type LaunchCoverOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export const COVER_LANE: ResourceLane = "gpu.local";
export const coverJobId = (id: string): string => `job:cover:${id}`;

/** Seconds on the receipt: illustrative, stage 1's figures rounded up. */
const TRANSCRIBE_SECONDS = 10;
const RENDER_SECONDS = 60;

/** Take n's seed (1..5), from the cover's id: YuE2's token seed and the KSampler's, the same on every retry. */
export function coverSeed(coverId: string, n: number): number {
  return Number.parseInt(createHash("sha256").update(`${coverId}/${n}`).digest("hex").slice(0, 12), 16) % 2 ** 32;
}
export const coverSeeds = (coverId: string): number[] => Array.from({ length: COVER_TAKE_COUNT }, (_, i) => coverSeed(coverId, i + 1));

function option(step: "transcribe" | "render", seconds: number): ModelOption {
  const model = step === "transcribe" ? SHEETSAGE2_ENCODER : YUE2_CHECKPOINT;
  return {
    key: `cover/comfyui/${model}`,
    lane: COVER_LANE,
    provider: "comfyui",
    model,
    label: step === "transcribe" ? "SheetSage2 · score · local" : "YuE2 · take · local",
    secondsPerUnit: seconds,
    usdPerUnit: 0,
    src: "illustrative",
    basis: {
      seconds: { src: "illustrative", note: step === "transcribe" ? "a 120 s reference transcribed in 6.3 s on this box (stage 1), rounded up; another tenant's prompts in ComfyUI's queue stretch it" : "a fresh 32-step YuE2 render took 47.9 s for about 120 s of audio on this box (stage 1), rounded up; a longer section takes longer" },
      usd: { src: "real", note: "free: a local model on this box's card; no vendor is paid" },
    },
  };
}

const s = (x: number): string => String(Math.round(x * 100) / 100);

/** Why `plan` cannot be launched for cover `c` under `mode`; nothing when it can. */
export function checkCover(c: CoverRecord, plan: CoverPlan, mode: ReceiptMode): Result<void> {
  if (mode !== "live") return err("refused", `a cover renders live on this box's card (free); a ${mode} receipt renders none`);
  if (c.state !== "draft" && c.state !== "failed") return err("refused", `cover ${c.id} is ${c.state}, not a draft or failed`);
  const at = `section ${s(plan.startS)}-${s(plan.endS)} s`;
  if (!Number.isFinite(plan.startS) || !Number.isFinite(plan.endS)) return err("invalid", `${at} is not a pair of times`);
  if (plan.startS < 0 || plan.endS > c.source.durationS) return err("invalid", `${at} is outside the song's 0-${s(c.source.durationS)} s`);
  if (plan.endS <= plan.startS) return err("invalid", `${at} ends before it starts`);
  const len = plan.endS - plan.startS;
  if (len < COVER_SECTION_MIN_S) return err("invalid", `${at} is shorter than ${COVER_SECTION_MIN_S} s`);
  if (len > COVER_SECTION_MAX_S) return err("invalid", `${at} is longer than ${COVER_SECTION_MAX_S} s`);
  if (plan.style.trim() === "") return err("invalid", "the style is empty");
  if (plan.style.length > COVER_STYLE_MAX) return err("invalid", `the style is ${plan.style.length} characters, over ${COVER_STYLE_MAX}`);
  if (plan.lyrics.length > COVER_LYRICS_MAX) return err("invalid", `the lyrics are ${plan.lyrics.length} characters, over ${COVER_LYRICS_MAX}`);
  if (plan.sourceStyle !== undefined && plan.sourceStyle.length > COVER_STYLE_MAX) return err("invalid", `the source's style is ${plan.sourceStyle.length} characters, over ${COVER_STYLE_MAX}`);
  return ok(undefined);
}

/* ── The receipt ──────────────────────────────────────────────────────────── */

type Unsigned = Omit<CoverRequest, "by">;

function readIn(r: Reader, c: CoverRecord, plan: CoverPlan, o: { readonly mode: ReceiptMode; readonly now: number }): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const checked = checkCover(c, plan, o.mode);
  if (!checked.ok) return checked;
  // The key names the cover AT its section, style and lyrics: a plan changed since the receipt is another line.
  const at = `cover:${c.id}@${createHash("sha256").update(JSON.stringify([plan.startS, plan.endS, plan.style, plan.lyrics])).digest("hex").slice(0, 12)}`;
  const first: PlanLine = { key: `${at}/${TRANSCRIBE_STEP}`, label: `score · ${s(plan.endS - plan.startS)} s of ${c.title}`, lane: COVER_LANE, units: 1, option: option("transcribe", TRANSCRIBE_SECONDS), after: [], order: 0, status: "pending" };
  const lines: PlanLine[] = [first];
  for (let n = 1; n <= COVER_TAKE_COUNT; n++) {
    const prev = lines[lines.length - 1] ?? first;
    lines.push({ key: `${at}/${renderStep(n)}`, label: `take ${n} · ${c.title}`, lane: COVER_LANE, units: 1, option: option("render", RENDER_SECONDS), after: [prev.key], order: n, status: "pending" });
  }
  const receipt = receiptFor({ subject: { kind: "run", lane: "audio" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const request: Unsigned = {
    coverId: c.id,
    startS: plan.startS,
    endS: plan.endS,
    style: plan.style,
    lyrics: plan.lyrics,
    seeds: coverSeeds(c.id),
    max_duration: COVER_MAX_DURATION,
    temperature: COVER_TEMPERATURE,
    estimates: { transcribe: { seconds: TRANSCRIBE_SECONDS, usd: 0 }, render: { seconds: RENDER_SECONDS, usd: 0 } },
  };
  return ok({ receipt, request });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The cover's receipt (no token), or its confirm - lib/producers/scoutSheet.ts `launchSheet`'s contract. */
export async function launchCover(store: Store, plan: CoverPlan, opts: LaunchCoverOptions): Promise<Result<CoverLaunch>> {
  if (!coverIdSchema.safeParse(plan.id).success) return err("not-found", `no cover ${plan.id}`);
  const now = opts.now ?? Date.now();
  const jobId = coverJobId(plan.id);
  if (jobOf(store, jobId) !== undefined) return ok({ kind: "existing", jobId });
  const c = await readCover(plan.id);
  if (c === undefined) return err("not-found", `no cover ${plan.id}`);
  const ask = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, c, plan, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<CoverLaunch> => {
    const read = readIn(t, c, plan, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `cover receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `cover:${c.id}` }, producer: COVER, lane: COVER_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: COVER_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  const seeds = coverSeeds(c.id);
  await mutateCover(c.id, (x) => {
    const { score: _score, ...rest } = x;
    return {
      ...rest,
      state: "queued",
      jobId,
      section: { startS: plan.startS, endS: plan.endS },
      style: plan.style,
      lyrics: plan.lyrics,
      ...(plan.sourceStyle === undefined || plan.sourceStyle === "" ? {} : { sourceStyle: plan.sourceStyle }),
      takes: seeds.map((seed, i) => ({ n: i + 1, seed, state: "pending" as const })),
    };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** The request a cover job carries: the event its launch wrote beside the enqueue. */
export function coverRequestOf(store: Store, jobId: string): Result<CoverRequest> {
  const page = queryEvents(store, { type: [COVER_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no cover request`) : parseCoverRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Production's engines are the acts' defaults (ffmpeg, this box's ComfyUI); a test hands fakes. */
export function coverProducer(o: { readonly store?: () => Result<Store>; readonly engines?: CoverActEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineCover(COVER_LANE, {
    request: (job) => {
      const st = store();
      return st.ok ? coverRequestOf(st.value, job.id) : st;
    },
    ...coverActs(o.engines),
  });
  // SheetSage2 and YuE2 run through ComfyUI: the job names the `comfy` engine (the storyboard producer's rule).
  return { ...p, engine: "comfy" };
}

/** Drive one cover job on this process (a CLI after a launch, a test): the worker's rules. */
export function driveCover(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: CoverActEngines; readonly run?: Omit<RunOptions, "dryOnly"> } = {}): Promise<Result<RunReport>> {
  const producer = coverProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { ...o.run, dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
