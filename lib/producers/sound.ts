import { tmpdir } from "node:os";
import path from "node:path";

import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import { LANE_CAPACITY, type MediaLane, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, ProducerRunInput, Receipt, ReceiptMode } from "@gt/domain/produce";
import { ceilingUsdSchema } from "@gt/domain/produce.schema";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY, dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import { append } from "@gt/kernel/events";
import type { Producer, StepContext } from "@gt/kernel/job-core";
import { enqueueIn } from "@gt/kernel/job";
import { recover, runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { assertFence } from "@gt/kernel/lease";
import { processKernel, storeLocation } from "@gt/kernel/process";
import { readRunIn, recordRunIn } from "@gt/kernel/records/launch";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";

import { OUT_DIRNAME } from "@/lib/fixtures/mode";

// THE SOUND PRODUCERS' KERNEL GLUE (L31: music video + Suno) - the three things
// both bound producers do the same way, said once:
//
//   the kernel this process drives   the universe's store (GRAVITONE_STORE_PATH
//                                    overrides), without `server-only`, because the
//                                    batch CLIs import it through tsx;
//   a launch is a receipt, then a     decision 3: no token returns the RECEIPT
//   confirm                           (lane, model, est seconds, the credit reason,
//                                    queue position, ETA), computed statically; the
//                                    token confirms it, and a stale token returns
//                                    the fresh receipt and writes nothing;
//   a drive                           the CLI's drain: the startup sweep first,
//                                    then each job through kernel `runJob`.
//
// v1 had none of the first two: the MV and Suno queues spent on the operator's
// Start with no receipt at all, and each had its own idea of a worker.

export type SoundKernel = { readonly store: Store; readonly fx: Effects };

export function soundKernel(): SoundKernel {
  const location = storeLocation(OUT_DIRNAME);
  const k = processKernel(location);
  if (!k.ok) throw k.error;
  const blobs = location === ":memory:" ? path.join(tmpdir(), "gravitone-blobs") : `${location}.blobs`;
  return { store: k.value.store, fx: liveEffects(k.value.store, blobStore(blobs)) };
}

export function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/**
 * The drive still holds its slot: asked in a kernel transaction right before a
 * step writes the ARTEFACT store (mv.json, suno.json), which the kernel's fence
 * does not cover. A driver that was taken over (it slept past its TTL and a
 * second driver claimed the slot) gets the fence's `conflict` and writes
 * nothing there either. The window between this check and the write is one
 * file lock, not a step.
 */
export function holdsSlot(ctx: StepContext): void {
  const slot = ctx.job.slot;
  const fence = ctx.job.lease?.fence;
  if (slot === undefined || fence === undefined) throw new AppError("internal", `job ${ctx.job.id} performs without a lease`);
  must(ctx.fx.tx("artefact.fence", (t) => assertFence(t, slot, fence)));
}

/** A job id read off a v1 record or a command line, minted at the door. */
export const jobIdOf = (id: string): JobId => must(parseAt("job id", jobIdSchema, id));

/** The operator, for the v1 doors (guardRequest'd routes and the CLIs). */
export const OPERATOR: Actor = { kind: "operator", id: "operator" };

/** A credit-priced option for a receipt line: its lane and pace, never a dollar figure. */
export function creditOption(o: { key: string; lane: ResourceLane; provider: string; model: string; label: string; seconds: number; why: string; pace: string }): ModelOption {
  return {
    key: o.key,
    lane: o.lane,
    provider: o.provider,
    model: o.model,
    label: o.label,
    secondsPerUnit: o.seconds,
    usdPerUnit: null,
    unpricedReason: o.why,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: o.pace }, usd: { src: "real", note: o.why } },
  };
}

/* ── launch: a receipt, then a confirm ────────────────────────────────────── */

export type LaunchLine = {
  readonly jobId: string;
  readonly runId: string;
  readonly label: string;
  readonly option: ModelOption;
  /** The run in its producer's own terms; absent, it is read off the run id (`runInputOf`). */
  readonly input?: ProducerRunInput;
};

/**
 * What a line's run IS, for its Run row: the track a music-video run renders (`mv.<track>.<enqueuedAt>`,
 * the stamp a number) or the proposal a Suno run sends (`suno.<proposal>`), from the ids mv.ts and
 * suno.ts mint. Any other producer must hand its `input`.
 */
export function runInputOf(producer: string, l: LaunchLine): ProducerRunInput {
  if (l.input !== undefined) return l.input;
  if (producer === "mv" && l.runId.startsWith("mv.") && l.runId.lastIndexOf(".") > 3) return { producer: "mv", track: l.runId.slice(3, l.runId.lastIndexOf(".")) };
  if (producer === "suno" && l.runId.startsWith("suno.")) return { producer: "suno", proposal: l.runId.slice(5) };
  throw new AppError("internal", `launch: ${producer} run ${l.runId} names no run input`);
}
export type LaunchSpec = { readonly producer: string; readonly media: MediaLane; readonly lines: readonly LaunchLine[] };
export type LaunchOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  readonly actor: Actor;
  /** Absent: return the receipt and write nothing. */
  readonly token?: string;
  /** Default: `GRAVITONE_DRY_ONLY=1` in the environment - live is then refused. */
  readonly dryOnly?: boolean;
  readonly now?: number;
};
export type LaunchResult =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly receipt: Receipt; readonly jobIds: readonly string[] };

const ceilingOf = (o: LaunchOptions): number | undefined => (o.ceilingUsd === undefined ? undefined : must(parseAt("ceiling", ceilingUsdSchema, o.ceilingUsd)));

function receiptIn(r: Reader, spec: LaunchSpec, o: LaunchOptions): Receipt {
  const plan: PlanLine[] = spec.lines.map((l, i) => ({ key: l.jobId, label: l.label, lane: l.option.lane, units: 1, option: l.option, after: [], order: i, status: "pending" }));
  const ceilingUsd = ceilingOf(o);
  return receiptFor({
    subject: { kind: "run", lane: spec.media },
    lines: plan,
    plan,
    // These jobs are priced as themselves, not as somebody else's work ahead of them.
    queue: readQueue(r, new Set(spec.lines.map((l) => l.jobId))),
    capacity: LANE_CAPACITY,
    now: o.now ?? Date.now(),
    mode: o.mode,
    ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
  });
}

/**
 * Launch `spec`'s jobs. A job that already exists is adopted, never enqueued
 * twice (a launch that died between the kernel and the v1 store finds it
 * again). Everything is written in ONE kernel transaction, after the receipt is
 * recomputed from what that transaction reads.
 */
export function launchJobs(spec: LaunchSpec, o: LaunchOptions): LaunchResult {
  const { store } = soundKernel();
  if (o.token === undefined) return { kind: "receipt", receipt: must(store.read((r) => receiptIn(r, spec, o))) };
  const token = o.token;
  return must(
    store.tx((t): LaunchResult => {
      const fresh = receiptIn(t, spec, o);
      if (fresh.token !== token) return { kind: "stale", fresh };
      // A receipt over its ceiling is launched: the ceiling is a stop point (Director's ruling).
      const dryOnly = o.dryOnly ?? dryOnlyFrom(process.env);
      const mode = o.mode === "dry" ? DRY : must(armLive(o.actor, t.at, `receipt ${token.slice(0, 12)} confirmed`, { dryOnly }));
      const ceilingUsd = ceilingOf(o);
      const jobIds: string[] = [];
      for (const l of spec.lines) {
        if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", l.jobId) === undefined) {
          // Its Run row first, in this transaction (L32 `recordRunIn`): the queue prices the job
          // from its quote, Runs draws it and a re-route preview reads it.
          const read = readRunIn(t, runInputOf(spec.producer, l), { mode: o.mode, units: 1, quote: { key: l.jobId, label: l.label, option: l.option } }, { now: o.now ?? Date.now() });
          recordRunIn(t, read, l.runId, l.jobId, o.actor);
          enqueueIn(t, { id: l.jobId, of: { kind: "run", id: l.runId }, producer: spec.producer, lane: l.option.lane, mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }), correlation: { runId: l.runId } }, o.actor);
        }
        jobIds.push(l.jobId);
      }
      append(t, { actor: o.actor, type: `${spec.producer}.launched`, subject: { kind: "queue", id: spec.producer }, data: { jobs: jobIds, token, mode: mode.kind } });
      return { kind: "launched", receipt: fresh, jobIds };
    }),
  );
}

/** Confirm a receipt this process just read: the CLI's `--yes` and the v1 board's Start. */
export function launchNow(spec: LaunchSpec, o: Omit<LaunchOptions, "token">): Extract<LaunchResult, { kind: "launched" }> {
  for (let tries = 0; tries < 3; tries++) {
    const r = launchJobs(spec, o);
    if (r.kind !== "receipt") throw new AppError("internal", "launch: a receipt read returned a confirm");
    const c = launchJobs(spec, { ...o, token: r.receipt.token });
    if (c.kind === "launched") return c;
    // The queue moved between the read and the confirm (another launch): read again.
  }
  throw new AppError("conflict", "launch: the queue kept moving under three receipts in a row; try again");
}

/** A kernel refusal as an HTTP status, for the v1 routes that now launch and act on jobs. */
export function statusOf(e: unknown): number | undefined {
  if (!(e instanceof AppError)) return undefined;
  const by: Readonly<Record<AppError["code"], number>> = { invalid: 400, "not-found": 404, conflict: 409, refused: 409, unauthenticated: 401, budget: 402, unavailable: 503, internal: 500 };
  return by[e.code];
}

/* ── drive ────────────────────────────────────────────────────────────────── */

export type DriveOptions = {
  /** Default: `GRAVITONE_DRY_ONLY=1` in the environment. */
  readonly dryOnly?: boolean;
  readonly run?: Omit<RunOptions, "dryOnly">;
  readonly onReport?: (jobId: string, report: Result<RunReport>) => void;
};

export type Drive = { readonly reports: readonly { readonly jobId: string; readonly report: Result<RunReport> }[]; readonly stopped?: string };

/**
 * Drive `jobIds` in order on this process (the worker does the same through
 * `workLoop`). The startup sweep runs first (background-jobs: startup-sweeps):
 * a job a dead driver left running is named interrupted before anything is
 * claimed beside it. A lane that is busy (another driver holds its slot), held
 * or unhealthy stops the drive with that sentence - v1's `mvWorkerPaused`.
 */
export async function driveProducer(producer: Producer, jobIds: readonly string[], o: DriveOptions = {}): Promise<Drive> {
  const { fx } = soundKernel();
  must(recover(fx, o.run?.holder === undefined ? {} : { holder: o.run.holder, ...(o.run.alive === undefined ? {} : { alive: o.run.alive }) }));
  const dryOnly = o.dryOnly ?? dryOnlyFrom(process.env);
  const reports: { jobId: string; report: Result<RunReport> }[] = [];
  for (const jobId of jobIds) {
    const report = await runJob(fx, producer, jobId, { ...o.run, dryOnly });
    reports.push({ jobId, report });
    o.onReport?.(jobId, report);
    if (!report.ok) continue;
    const out = report.value.outcome;
    if (out === "busy" || out === "held" || out === "unhealthy") return { reports, stopped: report.value.reason ?? `${producer.lane} is ${out}` };
  }
  return { reports };
}
