import type { WorkKind } from "@gt/catalog/recipes";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { RunMode } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import { isWork } from "@gt/domain/part";
import type { LaunchedProject, LaunchedRun, ModelOption, Receipt, ReceiptMode, RerouteOption } from "@gt/domain/produce";
import { ceilingUsdSchema, runInputSchema, type ParsedRunInput } from "@gt/domain/produce.schema";
import { runSchema, type Run } from "@gt/domain/run";
import { armLive, DRY } from "../dryrun.ts";
import { append } from "../events.ts";
import { enqueueIn } from "../job.ts";
import type { Reader, Store, Tx } from "../store.ts";
import { launchOf, modelOptions } from "./options.ts";
import { projectModel, readQueue, type ReadContext } from "./read.ts";
import { priceLine, receiptFor, rerouteDelta, type PlanLine } from "./receipt.ts";
import { runPlanOf, type RunPlan } from "./runplan.ts";
import { insertRun, loadParts, loadRun, putPart, putProject, putRun } from "./schema.ts";

// LAUNCH IS A RECEIPT, THEN A CONFIRM (COMMON decision 3). `*Receipt` reads; `launch*` takes the
// receipt's token back and, in ONE transaction, recomputes the receipt from what it reads now,
// refuses a stale token with the fresh receipt, and only then writes the records and their jobs
// (L25's `enqueueIn`, inside this transaction: a Run never exists without its Job, nor a Job
// serving nothing).
//
// v1 had no receipt anywhere: an article run spent at once (pipeline/article.mts), a music-video
// batch needed `--yes`, a Suno queue spent credits on enqueue. The prototype launched on ⏎.

export type LaunchOptions = { readonly mode: ReceiptMode; readonly ceilingUsd?: number };
export type LaunchContext = ReadContext & { readonly dryOnly: boolean };

export type LaunchOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError; readonly current?: { readonly rev: number }; readonly fresh?: Receipt };

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const capOf = (ctx: ReadContext): Readonly<Record<ResourceLane, number>> => ctx.capacity ?? LANE_CAPACITY;
const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

function ceilingOf(opts: LaunchOptions): number | undefined {
  return opts.ceilingUsd === undefined ? undefined : must(parseAt("ceiling", ceilingUsdSchema, opts.ceilingUsd));
}

/* ── a project ────────────────────────────────────────────────────────────── */

function planReceiptIn(r: Reader, id: string, opts: LaunchOptions, ctx: ReadContext): Receipt {
  const m = projectModel(r, id, ctx);
  if (m.project.launchedAt !== undefined) throw new AppError("refused", `project ${id} was launched at ${m.project.launchedAt}`);
  const ceilingUsd = ceilingOf(opts);
  return receiptFor({
    subject: { kind: "project", id, rev: m.project.rev },
    lines: m.lines.filter((l) => l.lane !== null && l.option !== undefined),
    plan: m.lines,
    queue: readQueue(r),
    capacity: capOf(ctx),
    now: ctx.now,
    mode: opts.mode,
    ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
  });
}

export function planReceipt(store: Store, id: string, opts: LaunchOptions, ctx: ReadContext): Result<Receipt> {
  return store.read((r) => planReceiptIn(r, id, opts, ctx));
}

function modeFor(opts: LaunchOptions, actor: Actor, at: string, token: string, dryOnly: boolean): RunMode {
  return opts.mode === "dry" ? DRY : must(armLive(actor, at, `receipt ${token.slice(0, 12)} confirmed`, { dryOnly }));
}

/**
 * The receipt is stale: say so, with the receipt as it reads now. A receipt OVER its ceiling is
 * not refused (Director's ruling, Phase 4: a ceiling is a STOP POINT). The worst case breaching
 * it says the run may stop there; the job stops before the step that would cross it (kernel
 * job-core `next`), with what it made kept. Refusing here refused the article band's top ($92)
 * under any ceiling below it, though most runs land near $70.
 */
function refusal<T>(fresh: Receipt, token: string): LaunchOutcome<T> | undefined {
  if (fresh.token !== token) return { ok: false, error: new AppError("conflict", "what this launch would do changed since its receipt; read the fresh receipt", { detail: "stale-receipt" }), fresh };
  return undefined;
}

/**
 * Launch a draft plan: one Job per work part, all in this transaction. A part that waits for
 * other parts is enqueued `planned` until `releaseHeld` sees its upstream ratified - the job store
 * has no dependency between jobs, and the worker would otherwise claim a motion job before its
 * frames exist. Not `paused` (Director's ruling): an operator resume would start it early.
 *
 * Each job carries the project's ceiling as its own - a job may never spend more than the whole
 * plan was allowed. DEVIATION (accepted for now): that is a per-job copy, not a pooled project
 * budget; two jobs may together spend up to twice it. Pooling needs a spend class per project.
 * The chosen option rides as a router pin when the router knows the provider.
 */
export function launchProject(store: Store, input: { id: string; baseRev: number; token: string } & LaunchOptions, actor: Actor, ctx: LaunchContext): LaunchOutcome<LaunchedProject> {
  const r = store.tx((t): LaunchOutcome<LaunchedProject> => {
    const m = projectModel(t, input.id, ctx);
    if (m.project.rev !== input.baseRev)
      return { ok: false, error: new AppError("conflict", `project ${input.id} moved on (now at revision ${m.project.rev})`), current: { rev: m.project.rev } };
    const fresh = planReceiptIn(t, input.id, input, ctx);
    const refused = refusal<LaunchedProject>(fresh, input.token);
    if (refused !== undefined) return refused;
    const mode = modeFor(input, actor, t.at, input.token, ctx.dryOnly);
    const ceilingUsd = ceilingOf(input);
    const day = dayOf(ctx.now);
    const jobIds: string[] = [];
    for (const row of loadParts(t, input.id)) {
      const p = row.part;
      if (!isWork(p)) continue;
      const picked = launchOf(p.kind, p.option, day) ?? fallbackLaunch(p.kind, day);
      const est = priceLine(p.units, picked.option);
      const jobId = `job:part:${p.id}`;
      enqueueIn(
        t,
        {
          id: jobId,
          of: { kind: "part", id: p.id },
          // Waiting for upstream is `planned`, not `paused`: the worker never claims it and no
          // operator resume can start it early; `releaseHeld` queues it (L25 `releaseIn`).
          state: p.after.length === 0 ? "queued" : "planned",
          producer: picked.producer,
          lane: picked.option.lane,
          mode,
          ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
          ...(picked.routed ? { steer: { pin: picked.option.provider } } : {}),
          correlation: { projectId: input.id },
        },
        actor,
      );
      putPart(t, input.id, { ...row, jobId, part: { ...p, quoted: { seconds: est.seconds, usd: est.usd } } });
      jobIds.push(jobId);
    }
    const project = { ...m.project, rev: m.project.rev + 1, launchedAt: t.at };
    putProject(t, project, m.project.rev);
    append(t, {
      actor,
      type: "project.launched",
      subject: { kind: "project", id: project.id },
      data: { projectId: project.id, rev: project.rev, jobs: jobIds, token: input.token, mode: mode.kind, usd: fresh.totals.usd, unpriced: fresh.totals.unpriced, ...(ceilingUsd === undefined ? {} : { ceilingUsd }), ...(fresh.overCeiling ? { overCeiling: true } : {}) },
    });
    return { ok: true, value: { projectId: project.id, rev: project.rev, jobIds } };
  });
  return r.ok ? r.value : r;
}

/** A part whose option the catalog dropped launches on its kind's first option, as the plan priced it. */
function fallbackLaunch(kind: WorkKind, day: string): NonNullable<ReturnType<typeof launchOf>> {
  const first = modelOptions(kind, day)[0];
  const picked = first === undefined ? undefined : launchOf(kind, first.key, day);
  if (picked === undefined) throw new AppError("internal", `launch: part kind ${kind} has no option`);
  return picked;
}

/* ── a run: a Floor composer's, or a producer's own launch ──────────────────── */

/**
 * A producer that prices its own line (extract's worst case over its gallery, Suno's credits):
 * the option it quotes - on a lane the catalog lets it run that kind on - and the key that binds
 * the receipt's token to what the run is FOR (a gallery digest), so a token cannot confirm a
 * different launch. Absent: the kind's catalog option, keyed `run`.
 */
export type RunQuote = { readonly key?: string; readonly label?: string; readonly option?: ModelOption };

export type RunLaunchOptions = LaunchOptions & { readonly units?: number; readonly quote?: RunQuote };

type Picked = NonNullable<ReturnType<typeof launchOf>>;

/** A run as read for its receipt: what `recordRunIn` writes and `launchRun` enqueues. */
export type RunRead = { readonly receipt: Receipt; readonly plan: RunPlan; readonly input: ParsedRunInput; readonly line: PlanLine; readonly picked: Picked };

/**
 * The option a run launches on. A composer's run takes its kind's first option and the producer
 * the catalog names for it. A producer's own launch runs under THAT producer, so only the kind's
 * options it makes are candidates (Suno makes a `track` on Suno, never on ElevenLabs under the
 * `score` producer), and a quoted option must sit on one of their lanes: a producer cannot price
 * itself onto a lane its catalog row does not give it.
 */
function pickRun(input: ParsedRunInput, plan: RunPlan, quote: RunQuote | undefined, day: string): { picked: Picked; option: ModelOption } {
  const own = "producer" in input ? input.producer : undefined;
  const all = modelOptions(plan.kind, day).flatMap((o) => launchOf(plan.kind, o.key, day) ?? []);
  const fit = own === undefined ? all : all.filter((p) => p.producer === own);
  const q = quote?.option;
  const onLane = q === undefined ? fit : fit.filter((p) => p.option.lane === q.lane);
  const picked = q === undefined ? fit[0] : (onLane.find((p) => p.option.key === q.key) ?? onLane[0]);
  if (picked === undefined) {
    if (q !== undefined && fit.length > 0) throw new AppError("invalid", `${own ?? plan.kind}: a ${plan.kind} run is made on ${[...new Set(fit.map((p) => p.option.lane))].join(" or ")}, not ${q.lane}`);
    throw new AppError("internal", `${own ?? "composer"}: the catalog gives ${plan.kind} no option${own === undefined ? "" : ` that ${own} makes`}`);
  }
  return { picked, option: q ?? picked.option };
}

function runReceiptIn(r: Reader, raw: unknown, opts: RunLaunchOptions, ctx: ReadContext): RunRead {
  const input = must(parseAt("run input", runInputSchema, raw));
  const plan = runPlanOf(input, opts.units);
  const { picked, option } = pickRun(input, plan, opts.quote, dayOf(ctx.now));
  const line: PlanLine = { key: opts.quote?.key ?? "run", label: opts.quote?.label ?? plan.kind, lane: option.lane, units: plan.units, option, after: [], order: Number.MAX_SAFE_INTEGER, status: "pending" };
  const ceilingUsd = ceilingOf(opts);
  const receipt = receiptFor({
    subject: { kind: "run", lane: plan.lane },
    lines: [line],
    plan: [line],
    queue: readQueue(r),
    capacity: capOf(ctx),
    now: ctx.now,
    mode: opts.mode,
    ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
  });
  return { receipt, plan, input, line, picked };
}

/** The receipt for a run: what launching `input` now would occupy and cost (the composer's Estimate). */
export function runReceipt(store: Store, input: unknown, opts: RunLaunchOptions, ctx: ReadContext): Result<Receipt> {
  return store.read((r) => runReceiptIn(r, input, opts, ctx).receipt);
}

/** Read a run inside a caller's transaction - a batch launch's receipt line, before `recordRunIn`. */
export function readRunIn(r: Reader, input: unknown, opts: RunLaunchOptions, ctx: ReadContext): RunRead {
  return runReceiptIn(r, input, opts, ctx);
}

/** A run's job id names its run: `job:run:<id>`, or `job:run:<id>~<n>` for a later launch of it. */
export function runJobId(runId: string, given?: string): string {
  const base = `job:run:${runId}`;
  if (given === undefined || given === base) return base;
  if (!given.startsWith(base) || !/^~[1-9][0-9]*$/.test(given.slice(base.length))) throw new AppError("invalid", `job ${given} does not name run ${runId}`);
  return given;
}

/**
 * Write the Run record for a read run in `t`, serving `jobId` - the half of a launch that a
 * producer confirming several runs under ONE receipt calls once per run inside its own
 * transaction (a batch of tracks). A run launched again (a re-run of a finished extract run, a
 * regenerated music video) keeps its one row, which moves to the new job with `run.relaunched`;
 * a run whose job is still at work is refused - one job serves a run at a time.
 */
export function recordRunIn(t: Tx, read: Pick<RunRead, "plan" | "input" | "line" | "picked">, id: string, jobId: string, actor: Actor): Run {
  const option = read.line.option ?? read.picked.option;
  const est = priceLine(read.line.units, option);
  const run = must(
    parseAt("run", runSchema, {
      id,
      lane: read.plan.lane,
      producer: "producer" in read.input ? read.input.producer : read.picked.producer,
      recipe: read.plan.recipe,
      input: read.input,
      ...("styleId" in read.input && read.input.styleId !== undefined ? { styleId: read.input.styleId } : {}),
      units: read.plan.units,
      option: option.key,
      estimate: est.usd === null ? { seconds: est.seconds, usd: null, unpricedReason: est.unpricedReason ?? "unpriced" } : { seconds: est.seconds, usd: est.usd, ...(est.usdRange === undefined ? {} : { usdRange: [...est.usdRange] }) },
      createdAt: t.at,
    }),
  );
  const have = t.get("SELECT job_id FROM runs WHERE id = ?", id);
  if (have === undefined) {
    insertRun(t, run, runJobId(id, jobId));
    return run;
  }
  const prior = String(have["job_id"]);
  const state = t.get("SELECT state FROM jobs WHERE id = ?", prior)?.["state"];
  if (prior === jobId || (state !== undefined && state !== "done" && state !== "cancelled")) {
    throw new AppError("conflict", `run ${id} is served by job ${prior}${typeof state === "string" ? ` (${state})` : ""}; one job serves a run at a time`);
  }
  putRun(t, run, runJobId(id, jobId));
  append(t, { actor, type: "run.relaunched", subject: { kind: "run", id }, data: { runId: id, from: prior, to: jobId } });
  return run;
}

/**
 * Launch a run - its Run record and its one Job, in one transaction, on the receipt's token. A
 * receipt over its ceiling is launched (the ceiling is where the job STOPS, Director's ruling);
 * the launch event records that it was confirmed over it.
 */
export function launchRun(
  store: Store,
  input: { input: unknown; token: string } & RunLaunchOptions,
  actor: Actor,
  ctx: LaunchContext & { readonly id: string; readonly jobId?: string },
): LaunchOutcome<LaunchedRun> {
  const r = store.tx((t): LaunchOutcome<LaunchedRun> => {
    const jobId = runJobId(ctx.id, ctx.jobId);
    const read = runReceiptIn(t, input.input, input, ctx);
    const refused = refusal<LaunchedRun>(read.receipt, input.token);
    if (refused !== undefined) return refused;
    const mode = modeFor(input, actor, t.at, input.token, ctx.dryOnly);
    const ceilingUsd = ceilingOf(input);
    const run = recordRunIn(t, read, ctx.id, jobId, actor);
    // The router pin rides only on the catalog's own routed option, never on a producer's quote.
    const routed = read.picked.routed && read.picked.option.key === run.option;
    enqueueIn(
      t,
      {
        id: jobId,
        of: { kind: "run", id: run.id },
        producer: run.producer,
        lane: read.line.option?.lane ?? read.picked.option.lane,
        mode,
        ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
        ...(routed ? { steer: { pin: read.picked.option.provider } } : {}),
        correlation: { runId: run.id },
      },
      actor,
    );
    append(t, {
      actor,
      type: "run.launched",
      subject: { kind: "run", id: run.id },
      data: { runId: run.id, jobId, lane: run.lane, recipe: run.recipe, producer: run.producer, token: input.token, mode: mode.kind, ...(read.receipt.overCeiling ? { overCeiling: true } : {}) },
    });
    return { ok: true, value: { runId: run.id, jobId } };
  });
  return r.ok ? r.value : r;
}

/* ── re-route previews ────────────────────────────────────────────────────── */

/** Every option the job's part (or run) could move to, each with what it does to the whole plan. */
export function rerouteOptions(store: Store, jobId: string, ctx: ReadContext): Result<RerouteOption[]> {
  return store.read((r) => {
    const day = dayOf(ctx.now);
    const part = r.get("SELECT project_id, part_id FROM parts WHERE job_id = ?", jobId);
    if (part !== undefined) {
      const m = projectModel(r, String(part["project_id"]), ctx);
      const key = String(part["part_id"]);
      const row = m.rows.find((x) => x.part.id === key);
      if (row === undefined || !isWork(row.part)) throw new AppError("not-found", `job ${jobId} serves no work part`);
      const own = new Set([...m.jobs.values()].map((j) => j.id));
      const queue = readQueue(r, own);
      const current = row.part.option;
      return (m.options.get(key) ?? []).map((option) => ({ option, current: option.key === current, ...rerouteDelta(m.lines, key, option, queue, capOf(ctx), ctx.now) }));
    }
    const run = r.get("SELECT id FROM runs WHERE job_id = ?", jobId);
    if (run === undefined) throw new AppError("not-found", `job ${jobId} serves no part or run`);
    const { run: rec } = loadRun(r, String(run["id"]));
    const kind = runPlanOf(rec.input, rec.units).kind;
    const queue = readQueue(r, new Set([jobId]));
    // A producer's own run moves only between options that producer makes: its job keeps its producer.
    const options = modelOptions(kind, day).filter((o) => !("producer" in rec.input) || launchOf(kind, o.key, day)?.producer === rec.producer);
    const chosen = options.find((o) => o.key === rec.option) ?? options[0];
    if (chosen === undefined) throw new AppError("internal", `run ${rec.id}: ${kind} has no option ${rec.producer} makes`);
    const lines: PlanLine[] = [{ key: "run", label: kind, lane: chosen.lane, units: rec.units, option: chosen, after: [], order: 0, status: "pending" }];
    return options.map((option) => ({ option, current: option.key === rec.option, ...rerouteDelta(lines, "run", option, queue, capOf(ctx), ctx.now) }));
  });
}
