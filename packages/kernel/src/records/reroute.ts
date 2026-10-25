import type { WorkKind } from "@gt/catalog/recipes";
import { AppError } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { isWork, type WorkPart } from "@gt/domain/part";
import type { ModelOption } from "@gt/domain/produce";
import type { Run } from "@gt/domain/run";
import { append } from "../events.ts";
import { move } from "../job-core.ts";
import { enqueueIn, jobEvent, loadJob, putJob, rerouteIn as steerJobIn, type EnqueueInput } from "../job.ts";
import type { RouteOutcome, Steer } from "../router/types.ts";
import type { Reader, Tx } from "../store.ts";
import { launchOf, modelOptions } from "./options.ts";
import { projectModel, type ProjectModel } from "./read.ts";
import { priceLine } from "./receipt.ts";
import { runPlanOf } from "./runplan.ts";
import { loadRun, putPart, putProject, putRun, type PartRow } from "./schema.ts";

// THE OPERATOR'S RE-ROUTE AS RECORDS VERBS (L41; Runs `O`, plan §8.7 steering). A job's route is
// two facts that must move together: the JOB's steer (or, for another lane, the job itself) and the
// part's or run's OPTION, which is what the Plan draws and the next receipt prices. L35 assembled
// both in the app (`_port/realReroute.ts`): a same-lane re-route was kernel `reroute` in one
// transaction and the record in a second, so a crash between them left a job steered to Leonardo
// under a part that still read Nano Banana; a cross-lane one built its cancel + enqueue + row move
// from kernel internals in route code. Both are here now, each ONE transaction in the caller's tx:
//
//   rerouteIn   same lane, same producer: the router judges the steer (kernel job.ts
//               `rerouteIn`), the row names the new option and its quote. A failed or interrupted
//               job goes back to its line as a retry would.
//   relaunchIn  another lane or producer: the job is cancelled with `job.cancelled` naming its
//               successor, `<id>~<n>` is enqueued on the target's lane IN THE OLD ONE'S QUEUE PLACE
//               (its `ord`; planned stays planned, paused stays paused), and the row moves to it with
//               its new option and quote. What the old job booked stays on the old job, where its
//               spend reconciles: another provider makes its own output, so nothing is carried.
//
// Both are refused while the job runs or after it ended (the step in flight was routed already).
// The lane hold and the receipt's token stay the caller's checks: they are the operator's terms,
// read in the same transaction before the verb is called.

const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** What a job serves: a Plan's work part, or a Run. */
export type Serving = { readonly kind: "part"; readonly m: ProjectModel; readonly row: PartRow & { readonly part: WorkPart } } | { readonly kind: "run"; readonly run: Run };

export function servingOf(r: Reader, job: Job, now: number): Serving {
  const part = r.get("SELECT project_id FROM parts WHERE job_id = ?", job.id);
  if (part !== undefined) {
    const m = projectModel(r, String(part["project_id"]), { now });
    const row = m.rows.find((x) => x.jobId === job.id);
    if (row === undefined || !isWork(row.part)) throw new AppError("not-found", `job ${job.id} serves no work part`);
    return { kind: "part", m, row: { ...row, part: row.part } };
  }
  const run = r.get("SELECT id FROM runs WHERE job_id = ?", job.id);
  if (run === undefined) throw new AppError("not-found", `job ${job.id} serves no part or run; it was enqueued before launches recorded one`);
  return { kind: "run", run: loadRun(r, String(run["id"])).run };
}

/** The options a job's serving row may move between, its kind, and the option it names now. */
export function routeChoices(s: Serving, now: number): { readonly kind: WorkKind; readonly options: readonly ModelOption[]; readonly current: string } {
  if (s.kind === "part") return { kind: s.row.part.kind, options: s.m.options.get(s.row.part.id) ?? [], current: s.row.part.option };
  const day = dayOf(now);
  const kind = runPlanOf(s.run.input, s.run.units).kind;
  // A producer's own run moves only between options that producer makes: its job keeps its producer.
  const options = modelOptions(kind, day).filter((o) => !("producer" in s.run.input) || launchOf(kind, o.key, day)?.producer === s.run.producer);
  return { kind, options, current: s.run.option };
}

/** The steer that runs `target`: a pin when the router routes it, none for a producer's own option. */
export function steerFor(kind: WorkKind, target: ModelOption, now: number): Steer {
  return launchOf(kind, target.key, dayOf(now))?.routed === true ? { pin: target.provider } : {};
}

export type RouteInput = {
  readonly jobId: string;
  /** The option key to move onto (`<kind>/<provider>/<model>`). */
  readonly key: string;
  readonly now: number;
  /** The router's judgement of the job's request under a steer; absent for a kind the router does not route. */
  readonly judge?: (steer: Steer | undefined) => RouteOutcome;
  /** A relaunch's ceiling; absent keeps the old job's. */
  readonly ceilingUsd?: number;
};

type Resolved = { readonly job: Job; readonly serving: Serving; readonly kind: WorkKind; readonly from: ModelOption | undefined; readonly target: ModelOption; readonly producer: string; readonly steer: Steer };

function resolve(t: Reader, input: RouteInput): Resolved {
  const { job } = loadJob(t, input.jobId);
  if (job.state === "running" || job.state === "done" || job.state === "cancelled") throw new AppError("refused", `job ${job.id} is ${job.state}; its route is fixed`);
  const serving = servingOf(t, job, input.now);
  const { kind, options, current } = routeChoices(serving, input.now);
  const target = options.find((o) => o.key === input.key);
  if (target === undefined) throw new AppError("invalid", `${input.key} is not an option for this ${kind}`);
  if (target.key === current) throw new AppError("refused", "that is the current route");
  const picked = launchOf(kind, target.key, dayOf(input.now));
  if (picked === undefined) throw new AppError("internal", `re-route: ${target.key} has no producer`);
  const steer = steerFor(kind, target, input.now);
  if (input.judge !== undefined && steer.pin !== undefined) {
    const verdict = input.judge(steer);
    if (verdict.kind === "refused") throw new AppError(verdict.code, `re-route refused by the router: ${verdict.message}`);
  }
  return { job, serving, kind, from: options.find((o) => o.key === current), target, producer: picked.producer, steer };
}

/** Whether moving `jobId` onto `key` keeps its job (a steer) or needs a successor on another lane. */
export function routeKind(r: Reader, input: RouteInput): "steer" | "relaunch" {
  const x = resolve(r, input);
  return input.judge !== undefined && x.producer === x.job.producer && x.target.lane === x.job.lane ? "steer" : "relaunch";
}

function estimateOf(units: number, o: ModelOption): Run["estimate"] {
  const e = priceLine(units, o);
  return e.usd === null ? { seconds: e.seconds, usd: null, unpricedReason: e.unpricedReason ?? `${o.label} is unpriced` } : { seconds: e.seconds, usd: e.usd, ...(e.usdRange === undefined ? {} : { usdRange: [e.usdRange[0], e.usdRange[1]] }) };
}

/** The records' half: the part (or run) names its new option and quote, and serves `jobId`. */
function recordIn(t: Tx, x: Resolved, jobId: string, actor: Actor): void {
  const s = x.serving;
  if (s.kind === "part") {
    const p = s.row.part;
    const est = estimateOf(p.units, x.target);
    putPart(t, s.m.project.id, { ...s.row, jobId, part: { ...p, option: x.target.key, quoted: { seconds: est.seconds, usd: est.usd } } });
    const project = { ...s.m.project, rev: s.m.project.rev + 1 };
    putProject(t, project, s.m.project.rev);
    append(t, { actor, type: "project.part-rerouted", subject: { kind: "project", id: project.id }, data: { projectId: project.id, rev: project.rev, partId: p.id, from: p.option, to: x.target.key, jobId } });
    return;
  }
  putRun(t, { ...s.run, option: x.target.key, estimate: estimateOf(s.run.units, x.target) }, jobId);
  append(t, { actor, type: "run.rerouted", subject: { kind: "run", id: s.run.id }, data: { runId: s.run.id, from: s.run.option, to: x.target.key, jobId } });
}

export type RouteMoved = { readonly jobId: string; readonly from: ModelOption | undefined; readonly target: ModelOption; readonly steerDropped?: string };

/** Same lane, same producer: the job's steer and its row's option, in the caller's one transaction. */
export function rerouteIn(t: Tx, input: RouteInput, actor: Actor): RouteMoved {
  const x = resolve(t, input);
  if (input.judge === undefined) throw new AppError("refused", `${x.kind} is not routed by the router; moving it to ${x.target.label} relaunches its job`);
  if (x.producer !== x.job.producer || x.target.lane !== x.job.lane) throw new AppError("refused", `${x.target.label} runs on ${x.target.lane} under ${x.producer}; job ${x.job.id} is ${x.job.producer} on ${x.job.lane} - relaunch it`);
  const steered = steerJobIn(t, x.job.id, x.steer, actor, input.judge);
  recordIn(t, x, x.job.id, actor);
  return { jobId: x.job.id, from: x.from, target: x.target, ...(steered.steerDropped === undefined ? {} : { steerDropped: steered.steerDropped }) };
}

/** The next free successor id of a job: `<base>~2`, `~3`... (records/launch.ts `runJobId`'s shape). */
function successorOf(t: Reader, id: string): string {
  const base = id.replace(/~[1-9][0-9]*$/, "");
  for (let k = 2; k < 1000; k++) if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", `${base}~${k}`) === undefined) return `${base}~${k}`;
  throw new AppError("conflict", `job ${base} has been re-routed a thousand times`);
}

/** Another lane or producer: cancel, enqueue the successor in the old one's place, move the row - one transaction. */
export function relaunchIn(t: Tx, input: RouteInput, actor: Actor): RouteMoved {
  const x = resolve(t, input);
  const old = x.job;
  // A successor puts a failed or interrupted job back in a queue, which only an operator does (job.ts rerouteIn, retry).
  if ((old.state === "failed" || old.state === "interrupted") && actor.kind !== "operator") throw new AppError("refused", `job ${old.id}: only an operator re-routes a ${old.state} job; ${actor.kind} ${actor.id} may not`);
  const id = successorOf(t, old.id);
  const ord = t.get("SELECT ord FROM jobs WHERE id = ?", old.id)?.["ord"];
  const cancelled = move(old, "cancelled");
  putJob(t, cancelled);
  jobEvent(t, actor, cancelled, "job.cancelled", { from: old.state, reroutedTo: id });
  const ceiling = input.ceilingUsd ?? old.ceilingUsd;
  const c = old.correlation;
  const correlation = { ...(c?.projectId === undefined ? {} : { projectId: c.projectId }), ...(c?.runId === undefined ? {} : { runId: c.runId }) };
  const next = enqueueIn(
    t,
    {
      id,
      of: old.of,
      producer: x.producer,
      lane: x.target.lane,
      state: old.state === "planned" ? "planned" : "queued",
      mode: old.mode,
      correlation,
      ...(ceiling === undefined ? {} : { ceilingUsd: ceiling }),
      ...(x.steer.pin === undefined ? {} : { steer: { pin: x.steer.pin } }),
      ...(typeof ord === "number" ? { order: ord } : {}),
    } satisfies EnqueueInput,
    actor,
  );
  if (old.state === "paused") {
    const held = move(next, "paused");
    putJob(t, held);
    jobEvent(t, actor, held, "job.paused", { from: "queued", why: "its predecessor was paused when it was re-routed" });
  }
  jobEvent(t, actor, next, "job.rerouted", { from: old.state, relaunchedFrom: old.id, was: x.from?.key ?? null, now: x.target.key });
  recordIn(t, x, id, actor);
  return { jobId: id, from: x.from, target: x.target };
}

/** The one verb Runs `O` confirms: a steer when the job can keep its lane and producer, else a relaunch. */
export function moveRouteIn(t: Tx, input: RouteInput, actor: Actor): RouteMoved & { readonly how: "steer" | "relaunch" } {
  const how = routeKind(t, input);
  return { how, ...(how === "steer" ? rerouteIn(t, input, actor) : relaunchIn(t, input, actor)) };
}
