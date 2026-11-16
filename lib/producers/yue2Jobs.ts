import { randomBytes } from "node:crypto";

import { YUE2_RIGHTS } from "@gt/domain/audio.yue2";
import {
  parseYue2PostInput,
  parseYue2PostRequest,
  parseYue2RenderInput,
  parseYue2RenderRequest,
  parseYue2ScoreInput,
  parseYue2ScoreRequest,
  type Yue2PostRequest,
  type Yue2RenderRequest,
  type Yue2ScoreRequest,
} from "@gt/domain/audio.yue2.jobs.schema";
import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt } from "@gt/domain/produce";
import type { ProducerName } from "@gt/domain/run";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn } from "@gt/kernel/job";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store, Tx } from "@gt/kernel/store";

// THE SONG LAB'S JOBS (spark yue2-song-lab WP3): the three producers' names, their job ids, the
// request each job carries and the launch that writes it. The producers are ./yue2.ts, their steps
// ./yue2Acts.ts.
//
// LAUNCHED AS SCOUT-INGEST AND MESH ARE (./scoutIngest.ts, ./mesh.ts): a free local job enqueued
// directly - no Run row, no ceiling, DRY. Nothing in these jobs reaches a vendor (the model runs on
// this box's card in WSL), so the mode changes nothing they do. The launch still answers a $0
// receipt (kernel records/receipt.ts `receiptFor`, the receipt every lane's launch reads, placed on
// gpu.local's queue) so the screen and the agent see the seconds and the queue place before it runs.
//
// THE REQUEST RIDES AN EVENT BESIDE THE ENQUEUE, in one transaction (the scout sheet's rule,
// packages/producers/src/scout-sheet/define.ts): `audio.yue2.<kind>-requested`, subject the job.
// A producer's plan is synchronous inside the driver's transaction, so the producer reads the
// request once, in its health check, and keeps it (./yue2.ts).

export const YUE2_RENDER: ProducerName = "yue2-render";
export const YUE2_SCORE: ProducerName = "yue2-score";
export const YUE2_POST: ProducerName = "yue2-post";
export const YUE2_LANE: ResourceLane = "gpu.local";

export const YUE2_REQUESTED = {
  "yue2-render": "audio.yue2.render-requested",
  "yue2-score": "audio.yue2.score-requested",
  "yue2-post": "audio.yue2.post-requested",
} as const;
export type Yue2Producer = keyof typeof YUE2_REQUESTED;

/** Per-step bounds (the brief): one seed's render, one take's scoring, one post-chain or window. */
export const YUE2_TIMEOUT_MS = { gen: 600_000, score: 300_000, post: 300_000 } as const;

/** Receipt seconds per unit: illustrative until a batch is measured on this box (yue2-lab gen2 ran ~2-4 min a seed). */
const SECONDS = { gen: 180, score: 60, post: 90 } as const;

export type Yue2Request = { readonly "yue2-render": Yue2RenderRequest; readonly "yue2-score": Yue2ScoreRequest; readonly "yue2-post": Yue2PostRequest };

/** A batch id: sortable by time, unique by its random tail. */
export function mintYue2Id(now: number, tail: string = randomBytes(3).toString("hex")): string {
  return `${new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${tail}`;
}

export const yue2JobId = (producer: Yue2Producer, key: string): string => `job:${producer}:${key}`;
/** The score job a render or a chain hands its takes to: one per handing job, so a re-drive enqueues none twice. */
export const scoreJobFor = (jobId: string): string => yue2JobId("yue2-score", `after:${jobId.replace(/^job:/, "")}`);

/** Enqueue a song-lab job and its request in the caller's transaction. */
export function enqueueYue2In<P extends Yue2Producer>(t: Tx, producer: P, jobId: string, request: Yue2Request[P], actor: Actor): void {
  enqueueIn(t, { id: jobId, of: { kind: "run", id: jobId.replace(/^job:/, "") }, producer, lane: YUE2_LANE }, actor);
  append(t, { actor, type: YUE2_REQUESTED[producer], subject: { kind: "job", id: jobId }, data: { ...request } });
}

const PARSE: { readonly [P in Yue2Producer]: (raw: unknown) => Result<Yue2Request[P]> } = {
  "yue2-render": parseYue2RenderRequest,
  "yue2-score": parseYue2ScoreRequest,
  "yue2-post": parseYue2PostRequest,
};

/** The request a song-lab job carries: the event its launch wrote beside the enqueue. */
export function yue2RequestOf<P extends Yue2Producer>(store: Store, producer: P, jobId: string): Result<Yue2Request[P]> {
  const page = queryEvents(store, { type: [YUE2_REQUESTED[producer]], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no ${producer} request`) : PARSE[producer](e.data);
}

/* ── the $0 receipt ───────────────────────────────────────────────────────── */

type Unit = "gen" | "score" | "post";

function option(unit: Unit): ModelOption {
  return {
    key: `yue2-${unit}/local/${YUE2_RIGHTS.model}`,
    lane: YUE2_LANE,
    provider: "local",
    model: YUE2_RIGHTS.model,
    label: unit === "gen" ? "YuE2 render · WSL" : unit === "score" ? "song scores · WSL" : "post-chain · WSL",
    secondsPerUnit: SECONDS[unit],
    usdPerUnit: 0,
    src: "illustrative",
    basis: {
      seconds: { src: "illustrative", note: `one ${unit} on this box's card in WSL, not yet measured here; other gpu.local work queues ahead of it` },
      usd: { src: "real", note: "free: an open-weights model on this box's card; no vendor is paid" },
    },
  };
}

function receiptIn(r: Reader, key: string, lines: readonly { readonly unit: Unit; readonly units: number; readonly label: string }[], now: number): Receipt {
  const plan: PlanLine[] = lines.map((l, i) => ({ key: `${key}/${l.unit}`, label: l.label, lane: YUE2_LANE, units: l.units, option: option(l.unit), after: i === 0 ? [] : [`${key}/${lines[i - 1]!.unit}`], order: i, status: "pending" }));
  return receiptFor({ subject: { kind: "run", lane: "audio" }, lines: plan, plan, queue: readQueue(r), capacity: LANE_CAPACITY, now, mode: "dry" });
}

/* ── the launches ─────────────────────────────────────────────────────────── */

export type Yue2Launch = { readonly jobId: string; readonly receipt: Receipt };
export type LaunchOptions = { readonly actor: Actor; readonly now?: number; readonly key?: string };

function launch<P extends Yue2Producer>(store: Store, producer: P, request: Yue2Request[P], lines: Parameters<typeof receiptIn>[2], o: LaunchOptions): Result<Yue2Launch> {
  const now = o.now ?? Date.now();
  const jobId = yue2JobId(producer, o.key ?? mintYue2Id(now));
  return store.tx((t): Yue2Launch => {
    const receipt = receiptIn(t, jobId, lines, now);
    enqueueYue2In(t, producer, jobId, request, o.actor);
    return { jobId, receipt };
  });
}

/** A batch of seeds: one render job (a step per seed), its takes then handed to one score job. */
export function launchRender(store: Store, raw: unknown, o: LaunchOptions): Result<Yue2Launch> {
  const p = parseYue2RenderInput(raw);
  if (!p.ok) return p;
  const n = p.value.seeds.length;
  return launch(store, "yue2-render", { ...p.value, by: o.actor.id }, [
    { unit: "gen", units: n, label: `YuE2 · ${n} seed${n === 1 ? "" : "s"} · cot ${p.value.cot}` },
    { unit: "score", units: n, label: `scores · ${n} take${n === 1 ? "" : "s"}` },
  ], o);
}

/** Score takes again (a new scorer, a take scored before it had a sheet). */
export function launchScore(store: Store, raw: unknown, o: LaunchOptions): Result<Yue2Launch> {
  const p = parseYue2ScoreInput(raw);
  if (!p.ok) return p;
  const n = p.value.takeIds.length;
  return launch(store, "yue2-score", { ...p.value, by: o.actor.id }, [{ unit: "score", units: n, label: `scores · ${n} take${n === 1 ? "" : "s"}` }], o);
}

/** A post-chain (a new take, then scored) or one blind arm's window (a file, not a take). */
export function launchPost(store: Store, raw: unknown, o: LaunchOptions): Result<Yue2Launch> {
  const p = parseYue2PostInput(raw);
  if (!p.ok) return p;
  const chain = (p.value.op ?? "chain") === "chain";
  const label = chain ? `post · ${p.value.stages.join(" + ")}` : `blind window · ${p.value.pairId ?? ""}/${p.value.arm ?? ""}`;
  return launch(store, "yue2-post", { ...p.value, by: o.actor.id }, chain ? [{ unit: "post", units: 1, label }, { unit: "score", units: 1, label: "scores · 1 take" }] : [{ unit: "post", units: 1, label }], o);
}

