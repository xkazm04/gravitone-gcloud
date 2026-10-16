import { COMPOSER_RECIPE } from "@gt/catalog/partOptions";
import { planParts, recipeById, type WorkKind } from "@gt/catalog/recipes";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { RunMode } from "@gt/domain/job";
import { LANE_CAPACITY, type MediaLane, type ResourceLane } from "@gt/domain/lane";
import { isWork } from "@gt/domain/part";
import type { ComposerInput, LaunchedProject, LaunchedRun, Receipt, ReceiptMode, RerouteOption } from "@gt/domain/produce";
import { ceilingUsdSchema, composerInputSchema } from "@gt/domain/produce.schema";
import { runSchema } from "@gt/domain/run";
import { armLive, DRY } from "../dryrun.ts";
import { append } from "../events.ts";
import { enqueueIn } from "../job.ts";
import type { Reader, Store } from "../store.ts";
import { launchOf, modelOptions } from "./options.ts";
import { projectModel, readQueue, type ReadContext } from "./read.ts";
import { priceLine, receiptFor, rerouteDelta, type PlanLine } from "./receipt.ts";
import { insertRun, loadParts, loadRun, putPart, putProject } from "./schema.ts";

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

/** The receipt is stale or over its ceiling: say so, with the receipt as it reads now. */
function refusal<T>(fresh: Receipt, token: string): LaunchOutcome<T> | undefined {
  if (fresh.token !== token) return { ok: false, error: new AppError("conflict", "what this launch would do changed since its receipt; read the fresh receipt", { detail: "stale-receipt" }), fresh };
  if (fresh.overCeiling)
    return { ok: false, error: new AppError("budget", `the priced exposure $${fresh.totals.usdRange?.[1] ?? fresh.totals.usd} breaches the $${fresh.ceilingUsd} ceiling`), fresh };
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
      data: { projectId: project.id, rev: project.rev, jobs: jobIds, token: input.token, mode: mode.kind, usd: fresh.totals.usd, unpriced: fresh.totals.unpriced, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) },
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

/* ── a Floor run ──────────────────────────────────────────────────────────── */

type RunPlan = { recipe: string; kind: WorkKind; lane: MediaLane; units: number };

function runPlanOf(input: ComposerInput, units: number | undefined): RunPlan {
  const map = COMPOSER_RECIPE[input.lane];
  const id = input.lane === "audio" ? ((input.kind === "sfx" ? map.sfx : map.music) ?? map.recipe) : map.recipe;
  const recipe = recipeById(id);
  const part = recipe === undefined ? undefined : planParts(recipe).find((p) => p.kind !== "gate" && p.kind !== "slot");
  if (part === undefined) throw new AppError("internal", `composer: recipe ${id} has no work part`);
  const range = part.unitsRange ?? [1, 200];
  const n = units === undefined ? part.units : Math.min(range[1], Math.max(range[0], Math.round(units)));
  return { recipe: id, kind: part.kind, lane: input.lane, units: n };
}

function runLines(plan: RunPlan, day: string): PlanLine[] {
  const option = modelOptions(plan.kind, day)[0];
  if (option === undefined) throw new AppError("internal", `composer: ${plan.kind} has no option`);
  return [{ key: "run", label: plan.kind, lane: option.lane, units: plan.units, option, after: [], order: Number.MAX_SAFE_INTEGER, status: "pending" }];
}

function runReceiptIn(r: Reader, raw: unknown, opts: LaunchOptions & { units?: number }, ctx: ReadContext): { receipt: Receipt; plan: RunPlan; input: ComposerInput; lines: PlanLine[] } {
  const input = must(parseAt("composer input", composerInputSchema, raw));
  const plan = runPlanOf(input, opts.units);
  const lines = runLines(plan, dayOf(ctx.now));
  const ceilingUsd = ceilingOf(opts);
  const receipt = receiptFor({
    subject: { kind: "run", lane: plan.lane },
    lines,
    plan: lines,
    queue: readQueue(r),
    capacity: capOf(ctx),
    now: ctx.now,
    mode: opts.mode,
    ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
  });
  return { receipt, plan, input, lines };
}

/** The Floor composer's Estimate and receipt: what launching `input` now would occupy and cost. */
export function runReceipt(store: Store, input: unknown, opts: LaunchOptions & { units?: number }, ctx: ReadContext): Result<Receipt> {
  return store.read((r) => runReceiptIn(r, input, opts, ctx).receipt);
}

/** Launch a Floor run: the Run record and its one Job, in one transaction. */
export function launchRun(
  store: Store,
  input: { input: unknown; token: string; units?: number } & LaunchOptions,
  actor: Actor,
  ctx: LaunchContext & { readonly id: string },
): LaunchOutcome<LaunchedRun> {
  const r = store.tx((t): LaunchOutcome<LaunchedRun> => {
    const read = runReceiptIn(t, input.input, input, ctx);
    const refused = refusal<LaunchedRun>(read.receipt, input.token);
    if (refused !== undefined) return refused;
    const line = read.lines[0];
    const picked = line?.option === undefined ? undefined : launchOf(read.plan.kind, line.option.key, dayOf(ctx.now));
    if (line === undefined || picked === undefined) throw new AppError("internal", "composer: the run has no line");
    const est = priceLine(line.units, picked.option);
    const run = must(
      parseAt("run", runSchema, {
        id: ctx.id,
        lane: read.plan.lane,
        producer: picked.producer,
        recipe: read.plan.recipe,
        input: read.input,
        ...(read.input.lane === "image" && "styleId" in read.input && read.input.styleId !== undefined ? { styleId: read.input.styleId } : {}),
        units: read.plan.units,
        option: picked.option.key,
        estimate: est.usd === null ? { seconds: est.seconds, usd: null, unpricedReason: est.unpricedReason ?? "unpriced" } : { seconds: est.seconds, usd: est.usd, ...(est.usdRange === undefined ? {} : { usdRange: [...est.usdRange] }) },
        createdAt: t.at,
      }),
    );
    const jobId = `job:run:${run.id}`;
    const mode = modeFor(input, actor, t.at, input.token, ctx.dryOnly);
    const ceilingUsd = ceilingOf(input);
    insertRun(t, run, jobId);
    enqueueIn(
      t,
      {
        id: jobId,
        of: { kind: "run", id: run.id },
        producer: picked.producer,
        lane: picked.option.lane,
        mode,
        ...(ceilingUsd === undefined ? {} : { ceilingUsd }),
        ...(picked.routed ? { steer: { pin: picked.option.provider } } : {}),
        correlation: { runId: run.id },
      },
      actor,
    );
    append(t, { actor, type: "run.launched", subject: { kind: "run", id: run.id }, data: { runId: run.id, lane: run.lane, recipe: run.recipe, token: input.token, mode: mode.kind } });
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
    const options = modelOptions(kind, day);
    const chosen = options.find((o) => o.key === rec.option) ?? options[0];
    if (chosen === undefined) throw new AppError("internal", `run ${rec.id}: ${kind} has no option`);
    const lines: PlanLine[] = [{ key: "run", label: kind, lane: chosen.lane, units: rec.units, option: chosen, after: [], order: 0, status: "pending" }];
    return options.map((option) => ({ option, current: option.key === rec.option, ...rerouteDelta(lines, "run", option, queue, capOf(ctx), ctx.now) }));
  });
}
