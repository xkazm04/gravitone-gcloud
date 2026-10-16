import "server-only";

import { PART_OPTIONS } from "@gt/catalog/partOptions";
import type { WorkKind } from "@gt/catalog/recipes";
import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptSubject } from "@gt/domain/produce";
import { canonical, sha256Hex } from "@gt/kernel/canonical";
import { loadJob } from "@gt/kernel/job";
import { laneHold } from "@gt/kernel/job-queue";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { moveRouteIn, routeChoices, servingOf, type Serving } from "@gt/kernel/records/reroute";
import { derivePosture } from "@gt/kernel/router/posture";
import { route } from "@gt/kernel/router/route";
import { TABLES } from "@gt/kernel/router/tables";
import { ROUTER_MEDIA, type Availability, type RouteOutcome, type Steer } from "@gt/kernel/router/types";
import type { Reader, Store } from "@gt/kernel/store";

import type { ActOutcome, RerouteResult } from "./contract.ts";

// THE OPERATOR'S RE-ROUTE, REAL (Runs `O`; prototype studio.js `reroute`; plan §8.7 steering): a
// receipt first - what the job's part (or run) costs and where it lands on the new option - and
// then a confirm on that receipt's token (COMMON decision 3). The confirm is ONE kernel verb in ONE
// transaction (@gt/kernel/records/reroute `moveRouteIn`): a target on the job's own lane and
// producer steers the job and moves the row's option together; any other target cancels the job and
// enqueues its successor in its queue place on the target's lane, the row moving with it. L35 built
// both here, the same-lane one as two transactions (a crash between them left a steered job under a
// part naming its old option); this file keeps what is the app's - the receipt and its token, the
// lane-hold check, the judge from this process's environment.
// Both are refused while the job runs or after it ended (the step in flight was routed already),
// and while its lane holds for it: an interruption is acknowledged before it is acted on.
//
// THE JUDGE. A target the router routes is judged by `route` (packages/kernel/src/router/route.ts)
// under this process's posture: a pin the plan does not permit is refused with the router's own
// sentence. Availability is what the router cannot see from here: a DRY job calls no vendor, so
// every candidate is available to it; a live one needs its credential when the credential is an
// environment variable, and a presence-probed tool (a CLI, a local daemon) is the producer's to
// probe when its step routes for real - a re-route spawns nothing.


export type RerouteRead = {
  readonly job: Job;
  readonly kind: WorkKind;
  readonly serving: Serving;
  readonly from: ModelOption | undefined;
  readonly target: ModelOption;
  readonly receipt: Receipt;
};

export type RerouteContext = { readonly now: number; readonly ceilingUsd?: number };

/** The receipt of moving `jobId` onto option `key`, with the token its confirm must carry back. */
export function readReroute(r: Reader, jobId: string, key: string, ctx: RerouteContext): RerouteRead {
  const { job } = loadJob(r, jobId);
  if (job.state === "running" || job.state === "done" || job.state === "cancelled") throw new AppError("refused", `job ${job.id} is ${job.state}; its route is fixed`);
  const s = servingOf(r, job, ctx.now);
  const { kind, options, current } = routeChoices(s, ctx.now);
  let subject: ReceiptSubject;
  let plan: PlanLine[];
  let lineKey: string;
  let exclude: Set<string>;
  if (s.kind === "part") {
    subject = { kind: "project", id: s.m.project.id, rev: s.m.project.rev };
    lineKey = s.row.part.id;
    plan = [...s.m.lines];
    exclude = new Set([...s.m.jobs.values()].map((j) => j.id));
  } else {
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

/* ── the confirm ────────────────────────────────────────────────────────────── */

export type RerouteDeps = { readonly env: Readonly<Record<string, string | undefined>>; readonly now: number };

const unitsOf = (s: Serving): number => (s.kind === "part" ? s.row.part.units : s.run.units);

export function rerouteReceipt(store: Store, jobId: string, key: string, ctx: RerouteContext): Result<RerouteResult> {
  const r = store.read((rd) => readReroute(rd, jobId, key, ctx).receipt);
  return r.ok ? ok({ kind: "receipt", receipt: r.value }) : r;
}

export function confirmReroute(store: Store, jobId: string, key: string, token: string, ceilingUsd: number | undefined, actor: Actor, deps: RerouteDeps): Result<RerouteResult> {
  const ctx: RerouteContext = { now: deps.now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) };
  const label = (o: ModelOption | undefined): string => o?.label ?? "its old route";
  // The receipt, the hold and the move are read and made in ONE transaction: nothing can move the
  // job between the token the operator confirmed and the verb that acts on it.
  return store.tx((t): RerouteResult => {
    const again = readReroute(t, jobId, key, ctx);
    if (laneHold(t, again.job.lane)?.jobId === again.job.id) throw new AppError("refused", `${again.job.lane} is on hold for this job: acknowledge the hold first`);
    if (again.receipt.token !== token) return { kind: "stale", fresh: again.receipt };
    const judge = judgeOf(again.kind, unitsOf(again.serving), again.job.mode.kind === "dry", deps.env, deps.now);
    const moved = moveRouteIn(t, { jobId, key, now: deps.now, ...(judge === undefined ? {} : { judge }), ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, actor);
    const dropped = moved.steerDropped === undefined ? "" : ` · ${moved.steerDropped}`;
    const id = moved.how === "relaunch" ? ` · ${moved.jobId}` : "";
    return { kind: "done", act: { jobId: moved.jobId, note: `re-routed · ${label(moved.from)} → ${moved.target.label}${dropped}${id}` } satisfies ActOutcome };
  });
}
