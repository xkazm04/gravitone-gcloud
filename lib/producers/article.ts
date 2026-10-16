import path from "node:path";

import { parseAt } from "@gt/domain/door";
import { err, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job, JobState, RunMode } from "@gt/domain/job";
import type { Receipt } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { armLive, DRY, dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { ackLane, laneHold } from "@gt/kernel/job-queue";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { enqueue, list, retry } from "@gt/kernel/job";
import { processKernel, storeLocation } from "@gt/kernel/process";
import { launchRun, runReceipt } from "@gt/kernel/records/launch";
import { loadRun } from "@gt/kernel/records/schema";
import type { Store } from "@gt/kernel/store";
import { defineArticle, type ArticlePorts } from "@gt/producers/article/define";
import { articleJobId, parseArticleJob, type ArticleAct } from "@gt/producers/article/plan";

import type { AgentResult } from "@/lib/agent/cliSeam";
import { defaultDeps, type EngineDeps } from "@/lib/articles/engine";
import { walk } from "@/lib/articles/drive";
import { approveRun } from "@/lib/articles/humanActs";
import { resolveRegistryDir } from "@/lib/articles/registryRead";
import { resumeRun } from "@/lib/articles/resume";
import { reworkRun } from "@/lib/articles/rework";
import type { LoopDriver } from "@/lib/articles/loop";
import { createRun } from "@/lib/articles/runCreate";
import { ArticleError, legacyDriverAlive, readRun, updateRun } from "@/lib/articles/store";
import { cappedTurn, depsThrough, describeTurn, liveTurn, refusedTurn, standInTurn, type ArticleTurn } from "@/lib/articles/turns";
import { WORKING, type ArticleRun, type ArticleTopic, type CreateRunInput } from "@/lib/articles/types";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";

// THE ARTICLE PRODUCER, BOUND (Phase 4, L30) - packages/producers/src/article's ports tied to
// lib/articles' engine, and the acts every entry point shares: the CLI, the routes, the loop
// and the Board's decision adapter launch, act on and drive THE SAME job records through here,
// so "the UI and the CLI on the same job" is one function, not a convention. Removed, and what
// holds the guarantee now:
//   `.driver` (a pid file for the whole drive)  ->  the kernel's fenced slot lease on seat.text
//       (`runJob`): a second driver of the job is refused at the claim, as
//       tests/next-server/producer-article.test.ts shows; a driver that lost its slot writes
//       nothing (packages/kernel/test/job.crash.test.ts).
//   `launchRun` (an un-awaited promise in four routes)  ->  `enqueue`; the worker or the CLI drives.
//   `resumeRun` as a restart  ->  the operator's `retry` of the job (lib/articles/drive.ts `walk`).
// The `.lock` on run.json stays: it is a mutation lock, not a driver lease (store.ts says why).

export type ArticleBinding = {
  /** The engine deps a step starts from: a probe's clock, `render: false`. */
  readonly engine?: () => EngineDeps;
  /** Wraps the metered deps - the loop's guard (lib/articles/loop.ts `guardedDeps`). */
  readonly wrap?: (deps: EngineDeps) => EngineDeps;
  /** The process's kernel when absent (a test hands a temp one). */
  readonly kernel?: ArticleKernel;
};

export type ArticleKernel = { readonly store: Store; readonly fx: Effects };

/* ── the kernel ─────────────────────────────────────────────────────────────── */

/** The process's kernel, as the worker opens it (workers/worker.ts): the store and its effects. */
export function articleKernel(): Result<ArticleKernel> {
  const location = storeLocation(OUT_DIRNAME);
  const k = processKernel(location);
  if (!k.ok) return k;
  const blobs = blobStore(location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(location), "blobs"));
  return ok({ store: k.value.store, fx: liveEffects(k.value.store, blobs) });
}

function kernelOf(b: ArticleBinding): Result<ArticleKernel> {
  return b.kernel === undefined ? articleKernel() : ok(b.kernel);
}

const BY_STATUS: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 402: "budget", 403: "refused", 404: "not-found", 409: "conflict" };

/** A v1 act as a Result: ArticleError's status picks the code, its own code rides as `detail` (a route answers as v1 did). */
async function v1<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof Error)) return err("internal", String(e));
    if (!(e instanceof ArticleError)) return err("internal", e.message, { cause: e });
    return err(BY_STATUS[e.status] ?? (e.status >= 500 ? "unavailable" : "internal"), e.message, { detail: e.code, cause: e });
  }
}

/* ── the ports ──────────────────────────────────────────────────────────────── */

export function articlePorts(b: ArticleBinding = {}): ArticlePorts<ArticleTurn, AgentResult> {
  const base = (): EngineDeps => (b.engine ?? (() => defaultDeps()))();
  const depsWith = (turn: (t: ArticleTurn) => Promise<AgentResult>): EngineDeps => {
    const metered = depsThrough(base(), turn);
    return b.wrap === undefined ? metered : b.wrap(metered);
  };
  return {
    describe: describeTurn,
    live: liveTurn,
    stand: standInTurn,
    refused: refusedTurn,
    capped: cappedTurn,
    ensureRun: (job) => ensureRun(job, b),
    async step(runId, name, turn) {
      const r = await walk(runId, depsWith(turn), name);
      return r.ok ? { ok: true, status: r.run.status, skipped: r.skipped } : { ok: false, message: r.message };
    },
    async land(runId) {
      const r = await walk(runId, base(), "land");
      return r.ok ? { ok: true, status: r.run.status, skipped: r.skipped } : { ok: false, message: r.message };
    },
    registry: () => {
      try {
        return (base().registry ?? resolveRegistryDir()).dir;
      } catch (e) {
        return `unresolved (${e instanceof Error ? e.message : String(e)})`;
      }
    },
  };
}

/** The bound producer - the one line lib/producers/registry.ts carries. */
export function articleProducer(b: ArticleBinding = {}): Producer {
  return defineArticle(articlePorts(b));
}

const ID_IN_TOPIC = /^([a-z0-9-]+)\/([a-z0-9-]+)$/;

/** The create step: the manifest under the Run's own id. A CLI or route launch wrote it first (its errors reach
 *  the caller); a Floor launch did not, and its job writes it from the Run's input (`bundle/slug` is a subject). */
async function ensureRun(job: Job, b: ArticleBinding): Promise<Result<{ runId: string; created: boolean }>> {
  const { runId } = parseArticleJob(job.id);
  const have = await readRun(runId).then(
    () => true,
    (e: unknown) => {
      if (e instanceof ArticleError && e.code === "not-found") return false;
      throw e;
    },
  );
  if (have) return ok({ runId, created: false });
  const k = kernelOf(b);
  if (!k.ok) return k;
  const rec = k.value.store.read((r) => loadRun(r, runId).run);
  if (!rec.ok) return err("not-found", `article job ${job.id}: no run.json and no Run record ${runId} to make one from`);
  if (rec.value.input.lane !== "article") return err("invalid", `run ${runId} is a ${rec.value.input.lane} run, not an article`);
  const m = ID_IN_TOPIC.exec(rec.value.input.topic);
  const input: CreateRunInput = { topic: m === null ? { kind: "free", text: rec.value.input.topic } : { kind: "subject", bundle: m[1] ?? "", subject: m[2] ?? "", text: "" } };
  const made = await createRun(input, (b.engine ?? (() => defaultDeps()))(), { id: runId });
  return made.status === "failed" ? err("unavailable", made.error ?? `run ${runId} could not be created`) : ok({ runId, created: true });
}

/* ── the acts ───────────────────────────────────────────────────────────────── */

export type ActOptions = {
  readonly actor: Actor;
  readonly mode: "dry" | "live";
  readonly ceilingUsd?: number;
  /** GRAVITONE_DRY_ONLY, read from the environment the caller hands in. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly binding?: ArticleBinding;
  readonly now?: () => number;
};

const engineOf = (o: ActOptions): EngineDeps => (o.binding?.engine ?? (() => defaultDeps()))();

function modeOf(o: ActOptions, why: string): Result<RunMode> {
  if (o.mode === "dry") return ok(DRY);
  return armLive(o.actor, new Date((o.now ?? Date.now)()).toISOString(), why, { dryOnly: dryOnlyFrom(o.env ?? process.env) });
}

/** Every job serving this run, oldest first. */
export function articleJobsOf(runId: string, store: Store): Result<Job[]> {
  const all = list(store);
  if (!all.ok) return all;
  return ok(all.value.filter((j) => j.producer === "article" && j.of.kind === "run" && j.of.id === runId));
}

const HOLDING: readonly JobState[] = ["queued", "running"];

/** The runs something holds - what v1's readers asked `driverAlive`: a job queued or running, or a live
 *  `.driver` a v1 build left. A store that cannot be read holds nothing, and `unread` says so. */
export async function heldRuns(runIds: readonly string[], b: ArticleBinding = {}): Promise<{ held: ReadonlySet<string>; unread?: string }> {
  const held = new Set<string>();
  const k = kernelOf(b);
  const all = k.ok ? list(k.value.store) : k;
  for (const j of all.ok ? all.value : []) if (j.producer === "article" && j.of.kind === "run" && HOLDING.includes(j.state)) held.add(j.of.id);
  for (const id of runIds) if (!held.has(id) && (await legacyDriverAlive(id))) held.add(id);
  return all.ok ? { held } : { held, unread: all.error.message };
}

/** The act a run is at, so a resume or a crash-relaunch names the job that serves it. */
export function actOf(run: ArticleRun): ArticleAct {
  if (run.approval !== undefined) return { kind: "landing" };
  if (run.rework !== undefined) return { kind: "rework", n: run.rework.count };
  return { kind: "gate" };
}

/** Enqueue the job for `act` unless it exists: re-delivering an act finds the job it made. */
function enqueueAct(store: Store, run: ArticleRun, act: ArticleAct, mode: RunMode, actor: Actor, ceilingUsd: number | undefined): Result<string> {
  const id = articleJobId(run.id, act);
  const jobs = articleJobsOf(run.id, store);
  if (!jobs.ok) return jobs;
  if (jobs.value.some((j) => j.id === id)) return ok(id);
  const r = enqueue(store, { id, of: { kind: "run", id: run.id }, producer: "article", lane: "seat.text", mode, ...(ceilingUsd === undefined ? {} : { ceilingUsd }), correlation: { runId: run.id } }, actor);
  return r.ok ? ok(id) : r;
}

/** The mode a follow-on act inherits: a dry run's post is the stub's and never lands or spends live. */
function followMode(store: Store, run: ArticleRun, o: ActOptions, why: string): Result<{ mode: RunMode; ceilingUsd?: number }> {
  const jobs = articleJobsOf(run.id, store);
  if (!jobs.ok) return jobs;
  const gate = jobs.value.find((j) => j.id === articleJobId(run.id, { kind: "gate" }));
  if (gate?.mode.kind === "dry") return ok({ mode: DRY, ...(gate.ceilingUsd === undefined ? {} : { ceilingUsd: gate.ceilingUsd }) });
  const m = modeOf(o, why);
  if (!m.ok) return m;
  const ceilingUsd = o.ceilingUsd ?? gate?.ceilingUsd;
  return ok({ mode: m.value, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
}

export type Launched = { readonly run: ArticleRun; readonly receipt: Receipt; readonly jobId?: string };

/**
 * Create a run and enqueue its gate job: a receipt, then the caller's own confirm (decision 3). The receipt
 * is read BEFORE the manifest is written, so a launch over its ceiling creates nothing. A run the registry
 * could not resolve is created `failed` with no job (v1: visible and resumable); `resumeArticle` enqueues it.
 */
export async function launchArticle(input: CreateRunInput, o: ActOptions): Promise<Result<Launched>> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const quoted = quote(k.value.store, topicOf(input.topic), o);
  if (!quoted.ok) return quoted;
  const made = await v1(() => createRun(input, engineOf(o)));
  if (!made.ok) return made;
  if (made.value.status === "failed") return ok({ run: made.value, receipt: quoted.value.receipt });
  return confirm(k.value.store, made.value, quoted.value, o);
}

/** Launch a run that already has its manifest (the loop creates its own). */
export function launchCreated(run: ArticleRun, o: ActOptions): Result<Launched> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const quoted = quote(k.value.store, topicOf(run.topic), o);
  return quoted.ok ? confirm(k.value.store, run, quoted.value, o) : quoted;
}

const topicOf = (t: ArticleTopic): string => (t.kind === "subject" && t.bundle && t.subject ? `${t.bundle}/${t.subject}` : t.text.trim() || "article");

type Quoted = { readonly receipt: Receipt; readonly composer: { readonly lane: "article"; readonly text: string; readonly topic: string }; readonly now: number; readonly dryOnly: boolean };

/** The receipt (L26 `runReceipt`), refused here when its exposure breaches the ceiling. */
function quote(store: Store, topic: string, o: ActOptions): Result<Quoted> {
  const mode = modeOf(o, "article run launched");
  if (!mode.ok) return mode;
  const composer = { lane: "article" as const, text: topic, topic };
  const now = (o.now ?? Date.now)();
  const dryOnly = dryOnlyFrom(o.env ?? process.env);
  const read = runReceipt(store, composer, { mode: o.mode, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) }, { now });
  if (!read.ok) return read;
  if (read.value.overCeiling) return err("budget", `an article run is priced at up to $${read.value.totals.usdRange?.[1] ?? read.value.totals.usd}; the $${o.ceilingUsd} ceiling cannot hold it`);
  return ok({ receipt: read.value, composer, now, dryOnly });
}

/** The confirm (L26 `launchRun`): the Run and its gate job under the article run's own id. */
function confirm(store: Store, run: ArticleRun, q: Quoted, o: ActOptions): Result<Launched> {
  let receipt = q.receipt;
  // One retry on a stale token: the caller confirmed its own receipt, so a queue that moved
  // in the milliseconds between is re-read, not refused back to it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const l = launchRun(store, { input: q.composer, token: receipt.token, mode: o.mode, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) }, o.actor, { now: q.now, dryOnly: q.dryOnly, id: run.id });
    if (l.ok) return ok({ run, receipt, jobId: l.value.jobId });
    if (l.fresh === undefined || l.error.detail !== "stale-receipt") return err(l.error.code, `run ${run.id} was created and not launched: ${l.error.message}`);
    receipt = l.fresh;
  }
  return err("conflict", `run ${run.id} was created and not launched: its receipt went stale twice`);
}

/** The human's approval, then its one continuation: the landing job (outward - a branch and a PR). */
export async function approveArticle(runId: string, patches: string[], o: ActOptions): Promise<Result<{ run: ArticleRun; jobId: string }>> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const run = await v1(() => approveRun(runId, patches, engineOf(o)));
  return run.ok ? continueArticle(run.value, o, k.value.store) : run;
}

/** The rework act and its job. Refused while any job of the run is still at work. */
export async function reworkArticle(runId: string, note: string, o: ActOptions): Promise<Result<{ run: ArticleRun; jobId: string }>> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const store = k.value.store;
  const jobs = articleJobsOf(runId, store);
  if (!jobs.ok) return jobs;
  const busy = jobs.value.find((j) => j.state === "running" || j.state === "queued" || j.state === "paused");
  if (busy !== undefined) return err("conflict", `run ${runId} is being driven right now (job ${busy.id} is ${busy.state})`, { detail: "busy" });
  const run = await v1(() => reworkRun(runId, note, engineOf(o)));
  return run.ok ? continueArticle(run.value, o, store) : run;
}

/** The job that serves the run's current act, enqueued unless it exists: a re-delivered approval or return
 *  finds its job, and a crash between v1's act and the enqueue heals by calling this again. */
export function continueArticle(run: ArticleRun, o: ActOptions, given?: Store): Result<{ run: ArticleRun; jobId: string }> {
  const k = given === undefined ? kernelOf(o.binding ?? {}) : ok({ store: given });
  if (!k.ok) return k;
  const store = k.value.store;
  const act = actOf(run);
  const m = followMode(store, run, o, act.kind === "landing" ? "approved at the gate" : act.kind === "rework" ? `rework ${act.n} sent back` : "article run resumed");
  if (!m.ok) return m;
  const id = enqueueAct(store, run, act, m.value.mode, o.actor, m.value.ceilingUsd);
  return id.ok ? ok({ run, jobId: id.value }) : id;
}

/**
 * v1 `resume`, as the job's retry (an operator's act: `failed` and `interrupted` may have spent). The lane
 * hold the job left is acknowledged when it is its own; a run with no job (a v1 run, one created `failed`)
 * gets its job now. The walk takes a `failed` run back to the step that did not finish.
 */
export async function resumeArticle(runId: string, o: ActOptions): Promise<Result<{ run: ArticleRun; jobId: string }>> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const store = k.value.store;
  const before = await v1(() => readRun(runId));
  if (!before.ok) return before;
  const id = articleJobId(runId, actOf(before.value));
  const jobs = articleJobsOf(runId, store);
  if (!jobs.ok) return jobs;
  const job = jobs.value.find((j) => j.id === id);
  if (job?.state === "running") return err("conflict", `run ${runId} is being driven right now (job ${id})`, { detail: "busy" });
  if (job === undefined) {
    // No job to retry: v1's refusal for a run that is not resumable (rejected, landed, at the gate) and its rewind.
    const resumed = await v1(() => resumeRun(runId, engineOf(o)));
    return resumed.ok ? continueArticle(resumed.value, o, store) : resumed;
  }
  // A job is retried whatever the run reads: one killed after its check finished sits at the gate, unbooked.
  const run = before.value;
  if (job.state === "done" || job.state === "cancelled") return err("conflict", `job ${id} is ${job.state}; run ${runId} is ${run.status}`, { detail: "bad-transition" });
  if (job.state === "failed" || job.state === "interrupted") {
    const held = store.read((r) => laneHold(r, "seat.text"));
    if (held.ok && held.value?.jobId === id) {
      const acked = ackLane(store, "seat.text", o.actor);
      if (!acked.ok) return acked;
    }
    const jid = parseAt("job id", jobIdSchema, id);
    if (!jid.ok) return jid;
    const r = retry(store, jid.value, o.actor, o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd });
    if (!r.ok) return r;
  }
  return ok({ run, jobId: id });
}

/** Drive one article job in this process (the CLI; the worker does the same through `workLoop`). */
export async function driveArticle(jobId: string, o: { readonly binding?: ArticleBinding; readonly env?: Readonly<Record<string, string | undefined>>; readonly run?: RunOptions } = {}): Promise<Result<RunReport>> {
  const k = kernelOf(o.binding ?? {});
  if (!k.ok) return k;
  const r = await runJob(k.value.fx, articleProducer({ ...o.binding, kernel: k.value }), jobId, { ...o.run, dryOnly: dryOnlyFrom(o.env ?? process.env) });
  // The kernel stops a job BETWEEN steps (its ceiling against the next step's estimate), where no
  // step of the engine ran to say so: run.json would read as a stalled drive. Say it on the run.
  const stop = r.ok ? r.value.job?.stop : undefined;
  if (r.ok && stop !== undefined && r.value.job?.error !== undefined) {
    const why = `${stop.by}: ${r.value.job.error.message}`;
    await updateRun(parseArticleJob(jobId).runId, (run) => (WORKING.includes(run.status) ? { ...run, status: "failed", error: why } : run));
  }
  return r;
}

/**
 * The loop's driver (lib/articles/loop.ts `LoopDriver`): each run launched as a job with
 * the loop's per-run ceiling as the job's, driven here under the kernel lease with the
 * loop's guard around the metered turns, and a failed run retried as the operator's act.
 */
export function loopDriver(o: ActOptions): LoopDriver {
  const drive = async (runId: string, jobId: string, guard: (d: EngineDeps) => EngineDeps): Promise<ArticleRun> => {
    const r = await driveArticle(jobId, { binding: { ...o.binding, wrap: guard }, ...(o.env === undefined ? {} : { env: o.env }) });
    if (!r.ok) throw new ArticleError(`job ${jobId}: ${r.error.message}`, 409, r.error.code);
    if (r.value.outcome === "busy" || r.value.outcome === "held" || r.value.outcome === "unhealthy") throw new ArticleError(`job ${jobId} was not driven (${r.value.outcome}): ${r.value.reason ?? ""}`, 409, r.value.outcome);
    return readRun(runId);
  };
  return {
    async start(run, guard, ceilingUsd) {
      const l = launchCreated(run, { ...o, ceilingUsd });
      if (!l.ok) {
        // Refused at its receipt (a run ceiling under the run's price): the manifest the loop made says so.
        await updateRun(run.id, (r) => ({ ...r, status: "failed", error: `launch refused: ${l.error.message}` }));
        throw new ArticleError(l.error.message, 409, l.error.code);
      }
      if (l.value.jobId === undefined) return l.value.run;
      return drive(run.id, l.value.jobId, guard);
    },
    async resume(runId, guard) {
      const r = await resumeArticle(runId, o);
      if (!r.ok) throw new ArticleError(r.error.message, 409, r.error.code);
      return drive(runId, r.value.jobId, guard);
    },
    async driven(runId) {
      const k = kernelOf(o.binding ?? {});
      if (!k.ok) return false;
      const jobs = articleJobsOf(runId, k.value.store);
      return jobs.ok && jobs.value.some((j) => j.state === "running" || j.state === "queued");
    },
  };
}
