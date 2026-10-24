import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { Producer, StepContext } from "@gt/kernel/job-core";
import { cancel, get, list, pause, resume, retry } from "@gt/kernel/job";
import { nextClaimable } from "@gt/kernel/job-queue";
import type { Store } from "@gt/kernel/store";
import { JOB_USD } from "@gt/kernel/spend/meter";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { buysStill, PHASE_OF, planOf, stillNeeded, type MvStep } from "@gt/producers/mv/plan";
import { defineMv, STUDIO_CREDITS, TEXT_TURN } from "@gt/producers/mv/producer";

import { standStill, standText } from "@/lib/sound/mv/standIns";
import { DEFAULT_ENGINES, runStep, type MvEngines, type StillRequest } from "@/lib/sound/mv/steps";
import { cleanTitle, readMv, withMv, type MvFile } from "@/lib/sound/mv/store";
import type { MvJob } from "@/lib/sound/mv/types";
import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest } from "@/lib/text/types";

import { creditOption, driveProducer, holdsSlot, jobIdOf, launchJobs, launchNow, must, soundKernel, type Drive, type DriveOptions, type LaunchOptions, type LaunchResult, type LaunchSpec } from "./sound";

// THE MUSIC-VIDEO PRODUCER, BOUND (Phase 4, L31) - packages/producers/src/mv's
// ports bound to v1's engines and to mv.json, which stays the ARTEFACT store:
// every step lands its files and fields there exactly as the v1 worker did, so
// the board, the batch, the ledger and the decision readers keep reading it.
// The kernel job is the truth for RUNNING state (decision 9); the readers
// overlay it (`mvKernelJobs`, lib/sound/mv/queue.ts `mvSnapshot`).
//
// REMOVED, and what replaced it: the `globalThis.__gtMvWorker` singleton, the
// mv.json `worker` pid lease (no TTL, no fence) and `kickMvWorker` - the kernel
// lease on box.render#1 is the one lease, fenced, so a second driver (a dev
// server's worker beside the batch CLI) gets `busy`, never the same job; the
// v1 crash recovery and `queue.interrupted` - kernel `recover` names the job
// interrupted with its step; `__setMvEngines` - `mvProducer({ engines })` binds
// the engines per drive, and the job's MODE decides whether the paid ones run.
//
// A KERNEL JOB PER ATTEMPT: `job:run:mv.<v1 id>.<enqueuedAt>`. A Regenerate
// restamps `enqueuedAt` (a new attempt: a new job); a retry keeps it (the same
// job, attempt++ - kernel retry). The id is derived, never stored, so a launch
// that died between the two stores finds its job again instead of enqueueing a
// second (enqueue idempotency per track, v1's rule, across processes now).

export const MV_PRODUCER = "mv";
export const mvRunId = (j: Pick<MvJob, "id" | "enqueuedAt">): string => `mv.${j.id}.${j.enqueuedAt}`;
export const mvKernelId = (j: Pick<MvJob, "id" | "enqueuedAt">): string => `job:run:${mvRunId(j)}`;

/** Every mv kernel job, by id: the running-state overlay the v1 readers apply. */
export function mvKernelJobs(store: Store = soundKernel().store): Map<string, Job> {
  return new Map(must(list(store)).filter((j) => j.producer === MV_PRODUCER).map((j) => [j.id, j]));
}

/* ── the ports ────────────────────────────────────────────────────────────── */

async function recordOf(job: Job): Promise<{ j: MvJob; done: MvStep[] }> {
  const f = await readMv();
  const j = f.jobs.find((x) => mvKernelId(x) === job.id);
  if (j === undefined) throw new AppError("not-found", `no music-video record serves kernel job ${job.id}`);
  return { j, done: f.progress[j.id] ?? [] };
}

/** A fenced write of the job's record: nothing lands for a driver that was taken over. */
async function patchRecord(job: Job, fn: (x: MvJob, f: MvFile) => void, ctx: StepContext): Promise<MvJob> {
  holdsSlot(ctx);
  return withMv((f) => {
    const x = f.jobs.find((y) => mvKernelId(y) === job.id);
    if (x === undefined) throw new AppError("not-found", `no music-video record serves kernel job ${job.id}`);
    fn(x, f);
    return { ...x, files: { ...x.files } };
  });
}

const running = (x: MvJob): void => {
  if (x.state === "active") return;
  x.state = "active";
  x.startedAt = Date.now();
  delete x.endedAt;
  delete x.error;
};

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

/**
 * The two paid engines, through the step's meter: declared (so a DRY job is
 * answered by the stand-in and books a would-call), booked on the job when
 * live. A studio still is credits - unpriced with its reason; a text turn is
 * its reported cost, or unpriced when the seat reports none.
 */
function metered(eng: MvEngines, ctx: StepContext): MvEngines {
  const subject = { kind: "job", id: ctx.job.id };
  const axes = { producer: MV_PRODUCER };
  return {
    ...eng,
    async still(req: StillRequest) {
      const intent: CallIntent<Awaited<ReturnType<MvEngines["still"]>>> = {
        provider: "leonardo-studio",
        model: "studio-still",
        usage: {},
        quote: { usd: null, basis: "unpriced", note: STUDIO_CREDITS },
        payload: { prompt: req.prompt, negativePrompt: req.negativePrompt ?? null },
        subject,
        stand: standStill,
      };
      const credits: SettleEntry = { amount: undefined, outcome: "served", basis: "credits", axes, reason: STUDIO_CREDITS };
      return unwrap(await ctx.meter.paid(JOB_USD, 0, intent, async () => ({ value: await eng.still(req), entries: [credits] })));
    },
    async reason(req: TextRequest) {
      const ask = eng.reason ?? routerReason;
      const intent: CallIntent<Awaited<ReturnType<typeof routerReason>>> = {
        provider: "text-router",
        model: req.turn,
        usage: {},
        quote: { usd: null, basis: "unpriced", note: TEXT_TURN },
        payload: { turn: req.turn, prompt: req.prompt },
        subject,
        stand: () => standText(req),
      };
      return unwrap(
        await ctx.meter.paid(JOB_USD, 0, intent, async () => {
          const out = await ask(req);
          const usd = out.provenance.costUsd;
          const entry: SettleEntry =
            usd !== undefined && usd > 0
              ? { amount: usd, outcome: "served", basis: "vendor", axes: { ...axes, turn: req.turn } }
              : { amount: undefined, outcome: "served", basis: "seat", axes: { ...axes, turn: req.turn }, reason: `${out.provenance.provider} reported no cost for the ${req.turn} turn` };
          return { value: out, entries: [entry] };
        }),
      );
    },
  };
}

/** The interrupted mv job whose still may have been bought, if any - the look v1 forced by switching its queue off.
 *  Read off the interrupted jobs only: this runs before every claim on box.render, and the store holds every producer's. */
function stuckAtStill(store: Store): Job | undefined {
  return must(list(store, { state: "interrupted" })).find((j) => j.producer === MV_PRODUCER && j.interruption?.stage === "still");
}

export function mvProducer(binding: { readonly engines?: Partial<MvEngines> } = {}): Producer {
  const eng: MvEngines = { ...DEFAULT_ENGINES, ...binding.engines };
  return defineMv({
    async plan(job, ctx) {
      let done: MvStep[] = [];
      const x = await patchRecord(
        job,
        (y, f) => {
          running(y);
          // Named here too: a launch that died between the two stores is healed by its first step.
          y.job = job.id;
          done = f.progress[y.id] ?? [];
        },
        ctx,
      );
      return { steps: planOf(x, done), supplied: x.stillFrom !== undefined };
    },
    async step(job, step, ctx) {
      const { j, done } = await recordOf(job);
      // Never re-spend: a step whose output the record holds (landed by a drive
      // that died before the kernel booked it) is skipped, not bought again.
      if (!stillNeeded(j, done, step)) return "skipped";
      const fresh = await patchRecord(
        job,
        (x) => {
          running(x);
          x.phase = PHASE_OF[step];
        },
        ctx,
      );
      const land = await runStep(step, fresh, metered(eng, ctx), () => holdsSlot(ctx));
      // The output and its progress mark land in ONE write: the ledger certifies what was done.
      await patchRecord(
        job,
        (x, f) => {
          land(x);
          if (x.redo?.length) f.progress[x.id] = [...(f.progress[x.id] ?? []), step];
        },
        ctx,
      );
      return "made";
    },
    async land(job, ctx) {
      await patchRecord(
        job,
        (x, f) => {
          x.state = "done";
          x.endedAt = Date.now();
          delete x.phase;
          delete x.redo;
          delete x.error;
          delete f.progress[x.id];
        },
        ctx,
      );
    },
    async fail(job, message, ctx) {
      await patchRecord(
        job,
        (x) => {
          x.state = "failed";
          x.endedAt = Date.now();
          x.error = message;
          delete x.phase;
        },
        ctx,
      );
    },
    async health(asked) {
      const { store } = soundKernel();
      const stuck = stuckAtStill(store);
      if (stuck !== undefined) {
        const f = await readMv();
        const j = f.jobs.find((x) => mvKernelId(x) === stuck.id);
        const what = j === undefined ? `job ${stuck.id}` : `"${cleanTitle(j.source.title)}"`;
        return { ok: false, reason: `${what} was interrupted at its still; a still may have been spent in the Leonardo studio - check it, then retry or cancel that job` };
      }
      // The job the driver is about to claim; with none in hand, the lane's head (an operator's look).
      const head = asked ?? must(store.read((r) => nextClaimable(r, "box.render")));
      if (head === undefined || head.producer !== MV_PRODUCER) return { ok: true };
      const f = await readMv();
      const j = f.jobs.find((x) => mvKernelId(x) === head.id);
      // v1's health pause: only a job that BUYS a still waits on the studio.
      if (j === undefined || !buysStill(j, f.progress[j.id] ?? [])) return { ok: true };
      const h = await eng.health().catch((e: unknown) => ({ ok: false, reason: errorMessage(e) }));
      return h.ok ? { ok: true } : { ok: false, reason: h.reason ?? "the still vendor is not reachable" };
    },
  });
}

/* ── launch, drive, and the operator's acts ──────────────────────────────── */

const PACE = "illustrative: fetch, analysis, two text turns, a studio still and a 1080p render per track (v1 measured none)";

/** One track's receipt line: box.render, credit-priced when it buys a still. */
export function mvLine(j: MvJob, done: readonly MvStep[]): LaunchSpec["lines"][number] {
  const buys = buysStill(j, done);
  return {
    jobId: mvKernelId(j),
    runId: mvRunId(j),
    label: cleanTitle(j.source.title),
    option: creditOption({
      key: `render/mv/${buys ? "studio-still" : "own-still"}`,
      lane: "box.render",
      provider: "mv",
      model: buys ? "leonardo-studio + libx264" : "libx264",
      label: buys ? "Leonardo studio still · 1080p render" : "own still · 1080p render",
      seconds: buys ? 415 : 355,
      why: buys ? `${STUDIO_CREDITS}; and ${TEXT_TURN}` : TEXT_TURN,
      pace: PACE,
    }),
  };
}

/**
 * Launch the v1 records `ids` (state queued) as kernel jobs: a receipt without
 * `token`, the jobs with it. Enqueueing a v1 record never spends (v1's rule);
 * this is the act that may, and it is a receipt first.
 */
export async function launchMv(ids: readonly string[], o: LaunchOptions): Promise<LaunchResult> {
  const r = launchJobs(await mvSpec(ids), o);
  if (r.kind === "launched") await nameJobs(r.jobIds);
  return r;
}

export async function launchMvNow(ids: readonly string[], o: Omit<LaunchOptions, "token">): Promise<Extract<LaunchResult, { kind: "launched" }>> {
  const r = launchNow(await mvSpec(ids), o);
  await nameJobs(r.jobIds);
  return r;
}

/** Each launched record names its job, so a reader with no kernel can tell a job-backed record. */
async function nameJobs(jobIds: readonly string[]): Promise<void> {
  const ids = new Set(jobIds);
  await withMv((f) => {
    for (const j of f.jobs) if (ids.has(mvKernelId(j))) j.job = mvKernelId(j);
  });
}

/** The launch of records `ids` as they stand in mv.json (./mvActs.ts prices a Regenerate with it). */
export async function mvSpec(ids: readonly string[]): Promise<LaunchSpec> {
  const f = await readMv();
  const lines = ids.map((id) => {
    const j = f.jobs.find((x) => x.id === id);
    if (j === undefined) throw new AppError("not-found", `no music-video job ${id}`);
    return mvLine(j, f.progress[j.id] ?? []);
  });
  return { producer: MV_PRODUCER, media: "video", lines };
}

export const driveMv = (jobIds: readonly string[], o: DriveOptions & { readonly engines?: Partial<MvEngines> } = {}): Promise<Drive> =>
  driveProducer(mvProducer(o.engines === undefined ? {} : { engines: o.engines }), jobIds, o);

/** Stop between steps (the Settled column's Stop): every waiting or running mv job pauses; the step in flight finishes. */
export function pauseMvJobs(actor: Actor, store: Store = soundKernel().store): string[] {
  const out: string[] = [];
  for (const j of mvKernelJobs(store).values()) {
    if (j.state !== "queued" && j.state !== "running") continue;
    must(pause(store, j.id, actor));
    out.push(j.id);
  }
  return out;
}

/**
 * Start: every paused mv job back in line, and every interrupted one retried -
 * Start was v1's "I have looked" (setMvQueue cleared `queue.interrupted`), and
 * only an operator presses it. A job interrupted at its still is the one the
 * health check names; it resumes here only because the operator chose to.
 */
export function resumeMvJobs(actor: Actor, opts: { readonly retryInterrupted?: boolean; readonly only?: ReadonlySet<string> } = {}, store: Store = soundKernel().store): string[] {
  const out: string[] = [];
  for (const j of mvKernelJobs(store).values()) {
    if (opts.only !== undefined && !opts.only.has(j.id)) continue;
    if (j.state === "paused") must(resume(store, j.id, actor));
    else if (j.state === "interrupted" && opts.retryInterrupted !== false) must(retry(store, j.id, actor));
    else continue;
    out.push(j.id);
  }
  return out;
}

/** The kernel side of a v1 act on one record's current attempt, when it has a job: one row, by its derived id. */
export function mvJobOf(j: Pick<MvJob, "id" | "enqueuedAt">, store: Store = soundKernel().store): Job | undefined {
  const r = get(store, jobIdOf(mvKernelId(j)));
  if (r.ok) return r.value.job.producer === MV_PRODUCER ? r.value.job : undefined;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

export const pauseMvJob = (id: string, actor: Actor, store: Store = soundKernel().store): Job => must(pause(store, jobIdOf(id), actor));
export const retryMvJob = (id: string, actor: Actor, store: Store = soundKernel().store): Job => must(retry(store, jobIdOf(id), actor));
export const cancelMvJob = (id: string, actor: Actor, store: Store = soundKernel().store): Job => must(cancel(store, jobIdOf(id), actor));
