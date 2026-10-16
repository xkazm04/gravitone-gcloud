import "server-only";

import { PART_OPTIONS } from "@gt/catalog/partOptions";
import type { WorkKind } from "@gt/catalog/recipes";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY } from "@gt/domain/lane";
import { isWork, type WorkPart } from "@gt/domain/part";
import type { ModelOption, Receipt, ReceiptSubject } from "@gt/domain/produce";
import type { Run } from "@gt/domain/run";
import { canonical, sha256Hex } from "@gt/kernel/canonical";
import { append } from "@gt/kernel/events";
import { enqueueIn, jobEvent, loadJob, putJob, reroute as kernelReroute, type EnqueueInput } from "@gt/kernel/job";
import { move } from "@gt/kernel/job-core";
import { laneHold } from "@gt/kernel/job-queue";
import { launchOf, modelOptions } from "@gt/kernel/records/options";
import { projectModel, readQueue, type ProjectModel } from "@gt/kernel/records/read";
import { priceLine, receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { runPlanOf } from "@gt/kernel/records/runplan";
import { loadRun, putPart, putProject, putRun, type PartRow } from "@gt/kernel/records/schema";
import { derivePosture } from "@gt/kernel/router/posture";
import { route } from "@gt/kernel/router/route";
import { TABLES } from "@gt/kernel/router/tables";
import { ROUTER_MEDIA, type Availability, type RouteOutcome, type Steer } from "@gt/kernel/router/types";
import type { Reader, Store, Tx } from "@gt/kernel/store";

import type { ActOutcome, RerouteResult } from "./contract.ts";

// THE OPERATOR'S RE-ROUTE, REAL (Runs `O`; prototype studio.js `reroute`; plan §8.7 steering): a
// receipt first - what the job's part (or run) costs and where it lands on the new option - and
// then a confirm on that receipt's token (COMMON decision 3). The kernel has the verb for a steer
// that keeps the job where it is (job.ts `reroute`: the router judges the steer, a failed or
// interrupted job is requeued as a retry would); almost every alternative the catalog offers sits
// on ANOTHER LANE (Flux on the GPU, Nano Banana on cloud.google, Leonardo on cloud.leonardo), and a
// job's lane is what its slot lease and its queue are keyed by, so no verb moves it there.
//
// So there are two confirms, and the choice is the target's, not the caller's:
//   same lane, same producer  kernel `reroute` with the router as judge, then the part's (or the
//                             run's) option in the records - the steer is the job's truth for
//                             what it calls, the record is what the Plan draws;
//   another lane or producer  ONE transaction: the job is cancelled with `job.cancelled` naming
//                             its successor, a new job `<id>~<n>` is enqueued on the new lane in
//                             the old one's queue place (planned stays planned, paused stays
//                             paused), and the part or run row moves to it with its new option and
//                             quote. A run already does this on relaunch (records/launch.ts
//                             `recordRunIn`, `run.relaunched`); a part now does it too. What the
//                             old job booked stays on the old job, where its spend reconciles -
//                             another provider makes its own output, so nothing is carried over.
// Both are refused while the job runs or after it ended (the step in flight was routed already),
// and while its lane holds for it: an interruption is acknowledged before it is acted on.
//
// THE JUDGE. A target the router routes is judged by `route` (packages/kernel/src/router/route.ts)
// under this process's posture: a pin the plan does not permit is refused with the router's own
// sentence. Availability is what the router cannot see from here: a DRY job calls no vendor, so
// every candidate is available to it; a live one needs its credential when the credential is an
// environment variable, and a presence-probed tool (a CLI, a local daemon) is the producer's to
// probe when its step routes for real - a re-route spawns nothing.

const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

type Serving = { readonly kind: "part"; readonly m: ProjectModel; readonly row: PartRow & { readonly part: WorkPart } } | { readonly kind: "run"; readonly run: Run };

export type RerouteRead = {
  readonly job: Job;
  readonly kind: WorkKind;
  readonly serving: Serving;
  readonly from: ModelOption | undefined;
  readonly target: ModelOption;
  readonly receipt: Receipt;
};

export type RerouteContext = { readonly now: number; readonly ceilingUsd?: number };

function servingOf(r: Reader, job: Job, now: number): Serving {
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

/** The receipt of moving `jobId` onto option `key`, with the token its confirm must carry back. */
export function readReroute(r: Reader, jobId: string, key: string, ctx: RerouteContext): RerouteRead {
  const { job } = loadJob(r, jobId);
  if (job.state === "running" || job.state === "done" || job.state === "cancelled") throw new AppError("refused", `job ${job.id} is ${job.state}; its route is fixed`);
  const s = servingOf(r, job, ctx.now);
  const day = dayOf(ctx.now);
  let kind: WorkKind;
  let options: readonly ModelOption[];
  let current: string;
  let subject: ReceiptSubject;
  let plan: PlanLine[];
  let lineKey: string;
  let exclude: Set<string>;
  if (s.kind === "part") {
    kind = s.row.part.kind;
    options = s.m.options.get(s.row.part.id) ?? [];
    current = s.row.part.option;
    subject = { kind: "project", id: s.m.project.id, rev: s.m.project.rev };
    lineKey = s.row.part.id;
    plan = [...s.m.lines];
    exclude = new Set([...s.m.jobs.values()].map((j) => j.id));
  } else {
    const rp = runPlanOf(s.run.input, s.run.units);
    kind = rp.kind;
    // A producer's own run moves only between options that producer makes: its job keeps its producer.
    options = modelOptions(kind, day).filter((o) => !("producer" in s.run.input) || launchOf(kind, o.key, day)?.producer === s.run.producer);
    current = s.run.option;
    subject = { kind: "run", lane: s.run.lane };
    lineKey = "run";
    plan = [{ key: "run", label: kind, lane: job.lane, units: s.run.units, after: [], order: 0, status: "pending" }];
    exclude = new Set([job.id]);
  }
  const target = options.find((o) => o.key === key);
  if (target === undefined) throw new AppError("invalid", `${key} is not an option for this ${kind}`);
  if (target.key === current) throw new AppError("refused", "that is the current route");
  const swapped = plan.map((l): PlanLine => (l.key === lineKey ? { ...l, option: target, lane: target.lane, ...(l.status === "stuck" ? { status: "pending" } : {}) } : l));
  const line = swapped.find((l) => l.key === lineKey);
  if (line === undefined) throw new AppError("internal", `re-route: ${lineKey} is not on its own plan`);
  const queue = readQueue(r, exclude);
  const base = receiptFor({ subject, lines: [line], plan: swapped, queue, capacity: LANE_CAPACITY, now: ctx.now, mode: job.mode.kind, ...(ctx.ceilingUsd === undefined ? {} : { ceilingUsd: ctx.ceilingUsd }) });
  // The job itself is half of what the operator agreed to: a retry or another re-route since the
  // read changes its state, attempt or steer, and the confirm must see that it did.
  const token = sha256Hex(canonical({ receipt: base.token, job: job.id, state: job.state, attempt: job.attempt, lane: job.lane, steer: job.steer ?? null, target: target.key }));
  const from = options.find((o) => o.key === current);
  return { job, kind, serving: s, from, target, receipt: { ...base, token } };
}

/* ── the judge ──────────────────────────────────────────────────────────────── */

const ENV_NAME = /^[A-Z][A-Z0-9_]+$/;

/** The router's judgement of `kind` under a steer, or undefined for a kind the router does not route. */
export function judgeOf(kind: WorkKind, units: number, dry: boolean, env: Readonly<Record<string, string | undefined>>, now: number): ((steer: Steer | undefined) => RouteOutcome) | undefined {
  const r = PART_OPTIONS[kind].route;
  if (r === undefined) return undefined;
  const medium = ROUTER_MEDIA.find((m) => m === r.medium);
  if (medium === undefined) return undefined;
  const table = TABLES[medium];
  const posture = derivePosture(env);
  const availability: Record<string, Availability> = {};
  for (const c of table.candidates) {
    const keyed = ENV_NAME.test(c.credential);
    availability[c.provider] = dry || !keyed || (env[c.credential] ?? "").trim() !== "" ? { ok: true } : { ok: false, why: "no-key", detail: `${c.credential} is not set` };
  }
  const [capability = r.capability, ...cls] = r.capability.split("/");
  return (steer) => {
    if (!posture.ok) return { kind: "refused", reason: "misconfigured", code: posture.error.code, message: posture.error.message, trail: [] };
    return route({ medium, capability, ...(cls.length === 0 ? {} : { class: cls.join("/") }), units: Math.max(1, units), ...(steer === undefined ? {} : { steer }) }, posture.value, { availability, now: new Date(now).toISOString() });
  };
}

/** The steer that runs `target`: a pin when the router routes it, none for a producer's own option. */
function steerFor(kind: WorkKind, target: ModelOption, day: string): Steer {
  return launchOf(kind, target.key, day)?.routed === true ? { pin: target.provider } : {};
}

/* ── the confirm ────────────────────────────────────────────────────────────── */

export type RerouteDeps = { readonly env: Readonly<Record<string, string | undefined>>; readonly now: number };

const unitsOf = (s: Serving): number => (s.kind === "part" ? s.row.part.units : s.run.units);

function estimateOf(units: number, o: ModelOption): Run["estimate"] {
  const e = priceLine(units, o);
  return e.usd === null ? { seconds: e.seconds, usd: null, unpricedReason: e.unpricedReason ?? `${o.label} is unpriced` } : { seconds: e.seconds, usd: e.usd, ...(e.usdRange === undefined ? {} : { usdRange: [e.usdRange[0], e.usdRange[1]] }) };
}

/** The records' half: the part (or run) names its new option and quote, and serves `jobId`. */
function recordIn(t: Tx, read: RerouteRead, jobId: string, actor: Actor): void {
  const s = read.serving;
  const est = estimateOf(unitsOf(s), read.target);
  if (s.kind === "part") {
    const p = s.row.part;
    putPart(t, s.m.project.id, { ...s.row, jobId, part: { ...p, option: read.target.key, quoted: { seconds: est.seconds, usd: est.usd } } });
    const project = { ...s.m.project, rev: s.m.project.rev + 1 };
    putProject(t, project, s.m.project.rev);
    append(t, { actor, type: "project.part-rerouted", subject: { kind: "project", id: project.id }, data: { projectId: project.id, rev: project.rev, partId: p.id, from: p.option, to: read.target.key, jobId } });
    return;
  }
  putRun(t, { ...s.run, option: read.target.key, estimate: est }, jobId);
  append(t, { actor, type: "run.rerouted", subject: { kind: "run", id: s.run.id }, data: { runId: s.run.id, from: s.run.option, to: read.target.key, jobId } });
}

/** The next free successor id of a job: `<base>~2`, `~3`... (records/launch.ts `runJobId`'s shape). */
function successorOf(t: Reader, id: string): string {
  const base = id.replace(/~[1-9][0-9]*$/, "");
  for (let k = 2; k < 1000; k++) if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", `${base}~${k}`) === undefined) return `${base}~${k}`;
  throw new AppError("conflict", `job ${base} has been re-routed a thousand times`);
}

/** Cancel `read.job` and enqueue its successor on the target's lane, the record moving with it - one transaction. */
function relaunchIn(t: Tx, read: RerouteRead, ceilingUsd: number | undefined, actor: Actor, day: string): string {
  const old = read.job;
  const picked = launchOf(read.kind, read.target.key, day);
  if (picked === undefined) throw new AppError("internal", `re-route: ${read.target.key} has no producer`);
  const id = successorOf(t, old.id);
  const ord = t.get("SELECT ord FROM jobs WHERE id = ?", old.id)?.["ord"];
  const cancelled = move(old, "cancelled");
  putJob(t, cancelled);
  jobEvent(t, actor, cancelled, "job.cancelled", { from: old.state, reroutedTo: id });
  const ceiling = ceilingUsd ?? old.ceilingUsd;
  const steer = steerFor(read.kind, read.target, day);
  const c = old.correlation;
  const correlation = { ...(c?.projectId === undefined ? {} : { projectId: c.projectId }), ...(c?.runId === undefined ? {} : { runId: c.runId }) };
  const input: EnqueueInput = {
    id,
    of: old.of,
    producer: picked.producer,
    lane: read.target.lane,
    state: old.state === "planned" ? "planned" : "queued",
    mode: old.mode,
    correlation,
    ...(ceiling === undefined ? {} : { ceilingUsd: ceiling }),
    ...(steer.pin === undefined ? {} : { steer: { pin: steer.pin } }),
    ...(typeof ord === "number" ? { order: ord } : {}),
  };
  const next = enqueueIn(t, input, actor);
  if (old.state === "paused") {
    const held = move(next, "paused");
    putJob(t, held);
    jobEvent(t, actor, held, "job.paused", { from: "queued", why: "its predecessor was paused when it was re-routed" });
  }
  jobEvent(t, actor, next, "job.rerouted", { from: old.state, relaunchedFrom: old.id, was: read.from?.key ?? null, now: read.target.key });
  recordIn(t, read, id, actor);
  return id;
}

export function rerouteReceipt(store: Store, jobId: string, key: string, ctx: RerouteContext): Result<RerouteResult> {
  const r = store.read((rd) => readReroute(rd, jobId, key, ctx).receipt);
  return r.ok ? ok({ kind: "receipt", receipt: r.value }) : r;
}

export function confirmReroute(store: Store, jobId: string, key: string, token: string, ceilingUsd: number | undefined, actor: Actor, deps: RerouteDeps): Result<RerouteResult> {
  const ctx: RerouteContext = { now: deps.now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) };
  const day = dayOf(deps.now);
  const read = store.read((rd) => ({ read: readReroute(rd, jobId, key, ctx), held: laneHold(rd, loadJob(rd, jobId).job.lane) }));
  if (!read.ok) return read;
  const { read: rr, held } = read.value;
  if (held?.jobId === rr.job.id) return err("refused", `${rr.job.lane} is on hold for this job: acknowledge the hold first`);
  const label = (o: ModelOption | undefined): string => o?.label ?? "its old route";
  const picked = launchOf(rr.kind, rr.target.key, day);
  const judge = judgeOf(rr.kind, unitsOf(rr.serving), rr.job.mode.kind === "dry", deps.env, deps.now);
  const steer = steerFor(rr.kind, rr.target, day);
  if (judge !== undefined && steer.pin !== undefined) {
    const verdict = judge(steer);
    if (verdict.kind === "refused") return err(verdict.code, `re-route refused by the router: ${verdict.message}`);
  }
  if (picked !== undefined && judge !== undefined && picked.producer === rr.job.producer && rr.target.lane === rr.job.lane) {
    // The kernel's verb is its own transaction: the token is compared on the read just made.
    if (rr.receipt.token !== token) return ok({ kind: "stale", fresh: rr.receipt });
    const id = parseAt("job id", jobIdSchema, rr.job.id);
    if (!id.ok) return id;
    const steered = kernelReroute(store, id.value, steer, actor, judge);
    if (!steered.ok) return steered;
    const rec = store.tx((t) => {
      // The record follows the steer only if nothing moved the job in between.
      const again = readRerouteAfter(t, rr, ctx);
      recordIn(t, again, rr.job.id, actor);
    });
    if (!rec.ok) return rec;
    const dropped = steered.value.steerDropped === undefined ? "" : ` · ${steered.value.steerDropped}`;
    return ok({ kind: "done", act: { jobId: rr.job.id, note: `re-routed · ${label(rr.from)} → ${rr.target.label}${dropped}` } satisfies ActOutcome });
  }
  // Another lane or producer: re-read and re-check the token INSIDE the transaction that relaunches.
  const out = store.tx((t): RerouteResult => {
    const again = readReroute(t, jobId, key, ctx);
    if (again.receipt.token !== token) return { kind: "stale", fresh: again.receipt };
    const id = relaunchIn(t, again, ceilingUsd, actor, day);
    return { kind: "done", act: { jobId: id, note: `re-routed · ${label(again.from)} → ${again.target.label} · ${id}` } };
  });
  return out;
}

/** The read the records' half writes from, after the kernel steered the job (same target, same record). */
function readRerouteAfter(t: Tx, before: RerouteRead, ctx: RerouteContext): RerouteRead {
  const s = servingOf(t, before.job, ctx.now);
  if (s.kind === "part") {
    const row = s.m.rows.find((x) => x.part.id === (before.serving.kind === "part" ? before.serving.row.part.id : ""));
    if (row === undefined || !isWork(row.part)) throw new AppError("conflict", `the part of job ${before.job.id} moved during its re-route`);
    return { ...before, serving: { kind: "part", m: s.m, row: { ...row, part: row.part } } };
  }
  return { ...before, serving: s };
}
