import { createHash } from "node:crypto";

import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ProducerRunInput, Receipt, ReceiptMode } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { armLive } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { modelOptions } from "@gt/kernel/records/options";
import { launchRun, runReceipt, type RunQuote } from "@gt/kernel/records/launch";
import type { PlanLine } from "@gt/kernel/records/receipt";
import type { NotPromise, Store, Tx } from "@gt/kernel/store";
import { defineExtract, type ExtractPorts, type StepIO } from "@gt/producers/extract/define";
import { stepName, type CallEstimates } from "@gt/producers/extract/units";

import { DEFAULT_CALL_ESTIMATE_USD, pruneFailures, step, type EngineIO } from "../foundry/extract/engine.ts";
import { TRANSFER_SCENES } from "../foundry/extract/prompts.ts";
import { createRun, getExtractRun, liveIO, readManifestNow, saveManifest } from "../foundry/extract/store.ts";
import type { Critique, ExtractManifest, ExtractOptions, ExtractUpload } from "../foundry/extract/types.ts";
import { next } from "../foundry/extract/units.ts";
import { ENUMS } from "../foundry/extract/vocabulary.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { blobRootOf } from "../kernelProcess.ts";

import { jobOf } from "./forge.ts";

// THE EXTRACT PRODUCER'S PORTS, BOUND TO v1 (Phase 4, L29) - the definition
// (packages/producers/src/extract/define.ts) over lib/foundry/extract: the
// manifest is still the artefact store and v1's `step` still performs a unit,
// but the DRIVER is a kernel job. What that replaced, and where it went:
//   - the manifest lease (`m.lease`, six minutes, `foreignLease`, `--force`) and
//     the in-process promise chain that serialised /step calls -> the job's slot
//     lease on cloud.google, fenced: a claim needs a QUEUED job, so a second
//     driver of the same job is refused before it touches anything, and a driver
//     whose slot was taken over is refused at its next manifest write
//     (`stillHeld`) as well as at its next booking;
//   - the browser's /step pump and the CLI's `runToEnd` loop -> `driveExtract`
//     (kernel `runJob`), the same drive for the route, the CLI and the worker;
//   - `m.spend` as the authority -> the job meter (every vendor call through
//     `ctx.meter.paid`); v1's `book` still writes `m.spend` for v1's readers and
//     the commit's cost-per-kept, by the same rule, so the two agree;
//   - the run's own `options.ceilingUsd` -> the job's ceiling, moved at launch.
// Not callable from the browser bundle: no "server-only" marker only because the
// CLI (pipeline/foundry/extract.mts) imports this under tsx, where it throws.

/* ── The ports ─────────────────────────────────────────────────────────────── */

const STAND_MODEL = "dry/stand-in";
/** A 1x1 PNG: what a dry generate "draws". It is a file, so v1's disk path runs whole. */
const STAND_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A dry readback: every observable on its vocabulary's first word, so scoring and grouping run. */
function standCritique(): Critique {
  const obs = Object.fromEntries(Object.entries(ENUMS).map(([f, words]) => [f, words[0] ?? "unknown"]));
  return {
    render_mode: obs["render_mode"] ?? "",
    medium: obs["medium"] ?? "",
    detail_density: obs["detail_density"] ?? "",
    surface_realism: obs["surface_realism"] ?? "",
    atmospherics: obs["atmospherics"] ?? "",
    particle_fx: obs["particle_fx"] ?? "",
    palette_strategy: obs["palette_strategy"] ?? "",
    black_handling: obs["black_handling"] ?? "",
    edge_treatment: obs["edge_treatment"] ?? "",
    finish: obs["finish"] ?? "",
    focus: obs["focus"] ?? "",
    has_text: false,
    dominant_colours: [],
    look: "a dry stand-in: no vendor was called",
    depiction: "a dry stand-in",
    critique: "a dry stand-in",
    recipe_fix: "",
  };
}

/** v1's IO for one run, with its three vendor calls declared to the job's meter and its save fenced. */
export function jobIO(runId: string, io: StepIO): EngineIO {
  const base = liveIO(runId);
  return {
    ...base,
    recognize: (image, instruction, schema) =>
      io.call({ kind: "recognize", payload: { instruction, schema, bytes: image.base64.length }, live: () => base.recognize(image, instruction, schema), stand: () => ({ value: standCritique(), model: STAND_MODEL, costUsd: 0 }) }),
    generate: (prompt, negative, aspect, seed) =>
      io.call({ kind: "generate", payload: { prompt, negative, aspect, seed }, live: () => base.generate(prompt, negative, aspect, seed), stand: () => ({ value: { base64: STAND_PNG, mime: "image/png" as const }, model: STAND_MODEL, costUsd: 0 }) }),
    reason: (prompt, schema) => io.call({ kind: "reason", payload: { prompt, schema }, live: () => base.reason(prompt, schema), stand: () => ({ value: { styles: [] }, model: STAND_MODEL, costUsd: 0 }) }),
    save: async (m) => {
      io.stillHeld();
      delete m.lease;
      await saveManifest(m);
    },
  };
}

function estimatesOf(runId: string): CallEstimates {
  const io = liveIO(runId);
  const at = (k: keyof CallEstimates): number => {
    const v = io.estimateUsd?.(k);
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CALL_ESTIMATE_USD[k];
  };
  return { recognize: at("recognize"), generate: at("generate"), reason: at("reason") };
}

export const extractPorts: ExtractPorts = {
  load(runId) {
    try {
      return ok(readManifestNow(runId));
    } catch (e) {
      if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : "unavailable", e.message);
      throw e;
    }
  },
  estimates: estimatesOf,
  async step(runId, unit, io) {
    const { run: m } = await getExtractRun(runId);
    const now = next(m);
    if (now === null || stepName(now) !== stepName(unit)) throw new AppError("conflict", `extract run ${runId}: ${stepName(unit)} is no longer the next unit`);
    // v1's breaker reads the job's count, so it trips on the same failure the kernel's does.
    m.fail_streak = io.streak;
    if (io.dry) m.dry = true;
    await step(m, jobIO(runId, io));
    return m;
  },
  async revive(runId, io) {
    const { run: m } = await getExtractRun(runId);
    const n = pruneFailures(m);
    // A retry is the operator's claim the cause was fixed (v1 CLI `--resume`), so a
    // failed run with nothing to prune - a fatal stop, a kernel ceiling - lives again too.
    if (m.status === "failed") {
      m.status = m.styles.length ? "replicating" : "reading";
      delete m.error;
      delete m.finished;
      delete m.stopped;
      m.fail_streak = 0;
    }
    m.log.push({ at: new Date().toISOString(), msg: `retry of ${m.job ?? "its job"}: ${n} failed unit(s) pruned` });
    io.stillHeld();
    await saveManifest(m);
    return m;
  },
  scenes: TRANSFER_SCENES.length,
};

/**
 * The bound producer: the one line for lib/producers/registry.ts. Its `settle` is the kernel's
 * post-job hook (job-core `Producer.settle`), so the manifest learns a kernel stop the same way
 * whether the CLI, the step route or the worker drove the job - the worker never called
 * `settleExtractManifest` before, and a run it stopped at its ceiling read mid-stage.
 */
export const extractProducer = (): Producer => ({ ...defineExtract(extractPorts), settle: (job) => settleExtract(job) });

/* ── The receipt ───────────────────────────────────────────────────────────── */

export type ExtractShape = {
  /** What the receipt is FOR: the run id, or a digest of a gallery not yet stored. Part of the token. */
  readonly key: string;
  readonly sources: number;
  readonly options: Pick<ExtractOptions, "rounds" | "replicas" | "transfers" | "grouping">;
};

const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/**
 * The receipt's line at the run's WORST CASE: what may be spent at most, each
 * call at its pre-call estimate. Tighter than v1's `--dry` print, which charged
 * every style `replicas x rounds` generations as if each were its own style AND
 * had `replicas` members: a source belongs to one style, so at most `sources`
 * replicas run (`rounds` each), and at most one style per source takes its
 * transfers. Per source: its read, rounds + transfers generations each read
 * back, and its share of the one synthesis turn. The kernel still stops the job
 * at its ceiling unit by unit; this is the figure a ceiling is promised against.
 */
export function extractLine(shape: ExtractShape, est: CallEstimates, day: string): PlanLine {
  const base = modelOptions("extract", day)[0];
  if (base === undefined) throw new AppError("internal", "catalog: the extract part has no option");
  const n = Math.max(1, shape.sources);
  const perStyle = shape.options.rounds + Math.min(shape.options.transfers, TRANSFER_SCENES.length);
  const group = shape.options.grouping === "none" ? 0 : est.reason / n;
  const usd = usd6(est.recognize + perStyle * (est.generate + est.recognize) + group);
  const option = { ...base, label: `${base.label} · worst case`, usdPerUnit: usd, secondsPerUnit: 20 + perStyle * 60, src: "model" as const };
  return { key: shape.key, label: `extract · ${n} source(s)`, lane: option.lane, units: n, option, after: [], order: Number.MAX_SAFE_INTEGER, status: "pending" };
}

/**
 * What the run is, in extract's own terms (@gt/domain/produce `ProducerRunInput`): the Run row
 * every launch now writes beside its job, so the queue prices it from its quote, Runs draws it
 * and a re-route preview reads it. No bytes: the gallery stays in the manifest.
 */
export function extractInput(slug: string, sources: number, options: ExtractShape["options"], folder?: string): ProducerRunInput {
  // v1 lets `transfers` be 0 (helpers.ts clampInt 0..scenes); the door counts from 1, so 0 is absent.
  return { producer: "extract", slug, sources, ...(folder === undefined ? {} : { folder }), rounds: options.rounds, replicas: options.replicas, ...(options.transfers > 0 ? { transfers: options.transfers } : {}), grouping: options.grouping };
}

/** The receipt: L26 `runReceipt` over extract's input, quoted at its worst case (`extractLine`). */
export function extractReceipt(store: Store, input: ProducerRunInput, shape: ExtractShape, opts: { mode: ReceiptMode; ceilingUsd?: number; now: number; est?: CallEstimates }): Result<Receipt> {
  return runReceipt(store, input, { mode: opts.mode, ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }), quote: quoteOf(shape, opts.est ?? estimatesOf(shape.key), opts.now) }, { now: opts.now });
}

function quoteOf(shape: ExtractShape, est: CallEstimates, now: number): RunQuote {
  const line = extractLine(shape, est, new Date(now).toISOString().slice(0, 10));
  return { key: line.key, label: line.label, ...(line.option === undefined ? {} : { option: line.option }) };
}

/** A gallery's receipt key: its slug and its files, so a token cannot confirm a different gallery. */
export function galleryKey(slug: string, uploads: readonly ExtractUpload[]): string {
  const h = createHash("sha256").update(slug);
  for (const u of uploads) h.update(`\n${u.name}\n${u.mime}\n${u.base64.length}\n`).update(u.base64);
  return `extract:new:${h.digest("hex").slice(0, 24)}`;
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export type ExtractTarget =
  /** `folder`: where the CLI read the gallery, kept on the Run row (a route's uploads have none). */
  | { readonly kind: "gallery"; readonly slug: string; readonly uploads: readonly ExtractUpload[]; readonly options: Partial<ExtractOptions>; readonly folder?: string }
  /** An existing run: v1's create route, a run from before Phase 4, or a re-run of a done one. */
  | { readonly kind: "run"; readonly runId: string; readonly rerun?: boolean };

export type LaunchExtractOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type ExtractLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly runId: string; readonly jobId: string; readonly receipt: Receipt }
  /** The run already has a job that is not finished: the same job, never a second (v1 MV enqueue idempotency). */
  | { readonly kind: "existing"; readonly runId: string; readonly jobId: string; readonly state: Job["state"] };

const jobBase = (runId: string): string => `job:run:${runId}`;

/** A free job id for a run: the base, else `~2`, `~3`... (a re-run of a done run is a new job). */
function freeJobId(store: Store, runId: string): string {
  for (let k = 1; k < 1000; k++) {
    const id = k === 1 ? jobBase(runId) : `${jobBase(runId)}~${k}`;
    if (jobOf(store, id) === undefined) return id;
  }
  throw new AppError("conflict", `extract run ${runId} has run a thousand times`);
}

const shapeOf = (m: ExtractManifest): ExtractShape => ({ key: `extract:${m.id}`, sources: m.sources.length, options: m.options });

export async function launchExtract(store: Store, target: ExtractTarget, opts: LaunchExtractOptions): Promise<Result<ExtractLaunch>> {
  const now = opts.now ?? Date.now();
  let m: ExtractManifest | undefined;
  if (target.kind === "run") {
    m = (await getExtractRun(target.runId)).run;
    const held = m.job === undefined ? undefined : jobOf(store, m.job);
    if (held !== undefined && !(target.rerun === true && (held.state === "done" || held.state === "cancelled"))) {
      return ok({ kind: "existing", runId: m.id, jobId: held.id, state: held.state });
    }
  }
  const ceilingUsd = opts.ceilingUsd ?? m?.options.ceilingUsd;
  const shape: ExtractShape =
    m !== undefined
      ? shapeOf(m)
      : target.kind === "gallery"
        ? { key: galleryKey(target.slug, target.uploads), sources: target.uploads.length, options: { rounds: target.options.rounds ?? 2, replicas: target.options.replicas ?? 2, transfers: target.options.transfers ?? 1, grouping: target.options.grouping ?? "engine" } }
        : shapeOf(m ?? (await getExtractRun(target.runId)).run);
  const input =
    m !== undefined ? extractInput(m.slug, m.sources.length, shape.options) : target.kind === "gallery" ? extractInput(target.slug, shape.sources, shape.options, target.folder) : undefined;
  if (input === undefined) throw new AppError("internal", "extract launch: no run and no gallery");
  const est = m === undefined ? undefined : estimatesOf(m.id);
  const read = (): Result<Receipt> => extractReceipt(store, input, shape, { mode: opts.mode, now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }), ...(est === undefined ? {} : { est }) });
  const receipt = read();
  if (!receipt.ok) return receipt;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: receipt.value });
  if (opts.token !== receipt.value.token) return ok({ kind: "stale", fresh: receipt.value });
  // A worst case over the ceiling is NOT refused (Director's ruling: a ceiling is a stop point).
  // The receipt carries `overCeiling`; the job stops unit by unit before the one that would cross
  // it, with every booked unit kept (kernel job-core `next`).

  const at = new Date(now).toISOString();
  if (opts.mode === "live") {
    // Refused here, before a gallery is stored, when this process may only run dry.
    const armed = armLive(opts.actor, at, `extract receipt ${opts.token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!armed.ok) return armed;
  }
  if (m === undefined && target.kind === "gallery") {
    // The ceiling travels with the JOB (kernel job.ts): the manifest is created without one.
    const { ceilingUsd: _moved, ...options } = target.options;
    m = await createRun(target.slug, [...target.uploads], options);
  }
  if (m === undefined) throw new AppError("internal", "extract launch: no run");
  const jobId = freeJobId(store, m.id);
  // The manifest names its job BEFORE the job exists: a launch that dies between
  // the two leaves a run whose job is missing, which the next launch enqueues.
  m.job = jobId;
  if (opts.mode === "dry") m.dry = true;
  if (m.options.ceilingUsd !== undefined) {
    m.log.push({ at, msg: `ceiling $${m.options.ceilingUsd.toFixed(2)} moved onto job ${jobId}` });
    delete m.options.ceilingUsd;
  }
  m.log.push({ at, msg: `launched as job ${jobId} (${opts.mode})` });
  await saveManifest(m);
  // The Run row and its job, in one kernel transaction (L26 `launchRun`). The caller confirmed
  // its receipt above; a queue that moved in the milliseconds since is re-read once, not refused.
  let token = opts.token;
  for (let attempt = 0; attempt < 2; attempt++) {
    const l = launchRun(store, { input, token, mode: opts.mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }), quote: quoteOf(shape, est ?? estimatesOf(shape.key), now) }, opts.actor, { now, dryOnly: opts.dryOnly, id: m.id, jobId });
    if (l.ok) return ok({ kind: "launched", runId: m.id, jobId, receipt: receipt.value });
    if (l.fresh === undefined || l.error.detail !== "stale-receipt") return err(l.error.code, `extract run ${m.id} was created and not launched: ${l.error.message}`);
    token = l.fresh.token;
  }
  return err("conflict", `extract run ${m.id} was created and not launched: its receipt went stale twice`);
}

/* ── Drive ─────────────────────────────────────────────────────────────────── */

/** The effect port over a store, blobs beside it - the worker's binding (workers/worker.ts). `_location`
 *  is the path `store` was opened at, kept for the callers; the root is lib/kernelProcess.ts's. */
export function effectsFor(store: Store, _location: string): Effects {
  return liveEffects(store, blobStore(blobRootOf(store)));
}

export type DriveOptions = RunOptions & {
  /** Told each unit as it is booked: the CLI's progress line (v1 `runToEnd`'s onUnit). */
  readonly onStep?: (step: string) => void;
};

/**
 * Drive a job until it finishes, stops, or reaches the deadline (the route's
 * kick admits for a second; the CLI drives to the end). The v1 manifest is told
 * what the kernel decided without it by the producer's `settle`, inside `runJob`.
 */
export async function driveExtract(store: Store, location: string, jobId: string, opts: DriveOptions = {}): Promise<Result<RunReport>> {
  const { onStep, ...run } = opts;
  const base = effectsFor(store, location);
  const fx: Effects =
    onStep === undefined
      ? base
      : {
          ...base,
          tx: <T,>(name: string, fn: (t: Tx) => NotPromise<T>): Result<T> => {
            const r = base.tx(name, fn);
            if (r.ok && name.startsWith("book:")) onStep(name.slice("book:".length));
            return r;
          },
        };
  return runJob(fx, extractProducer(), jobId, run);
}

/** `settleExtract` for a job read from the store (a repair, a test): the hook does the same. */
export async function settleExtractManifest(store: Store, jobId: string): Promise<void> {
  const job = jobOf(store, jobId);
  if (job !== undefined) await settleExtract(job);
}

/**
 * A job the KERNEL ended - its ceiling, a fatal outcome - never ran the unit
 * that would have told run.json, so v1's readers (the commit's `done|failed`
 * gate, the Weir) would read a run still mid-stage. Copy the ending onto the
 * manifest as v1's `stopFor` wrote it. Idempotent; a run already ended is left
 * alone.
 */
async function settleExtract(job: Job): Promise<void> {
  if (job.producer !== "extract" || job.state !== "failed" || job.error === undefined) return;
  const { run: m } = await getExtractRun(job.of.id);
  if (m.job !== job.id || m.status === "done" || m.status === "failed" || m.status === "committed") return;
  m.status = "failed";
  m.error = job.error.message;
  if (job.stop !== undefined) m.stopped = { by: job.stop.by, spentUsd: job.stop.spentUsd, ...(job.stop.ceilingUsd === undefined ? {} : { ceilingUsd: job.stop.ceilingUsd }), at: job.stop.at };
  m.log.push({ at: new Date().toISOString(), msg: `stopped: ${job.error.message}` });
  await saveManifest(m);
}
