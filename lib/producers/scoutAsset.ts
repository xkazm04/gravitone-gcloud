import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { TABLES } from "@gt/kernel/router/tables";
import type { Reader, Store } from "@gt/kernel/store";
import { ASSET_REQUEST, defineScoutAsset, parseAssetRequest, SCOUT_ASSET, type AssetRequest } from "@gt/producers/scout-asset/define";

import { conceptsFor } from "../foundry/scout/concept.ts";
import { readNightNow, mutateNight, withCandidate } from "../foundry/scout/store.ts";
import type { Asset3dCandidate, CandidateId, Night, NightId } from "../foundry/scout/types.ts";
import type { Technique } from "../foundry/mesh/types.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { PRICES } from "../imaging/pricing.ts";
import { generate } from "../imaging/router.ts";
import { kernel } from "../kernelProcess.ts";
import { assetActs, type AssetEngines } from "./scoutAssetActs.ts";
import { effectsFor } from "./extract.ts";

// THE SCOUT ASSET PRODUCER, BOUND (spark game-3d-assets WP4) - a night's `asset3d` candidate's
// cloud half as one kernel job (packages/producers/src/scout-asset/define.ts says which steps and
// why the hand-off is one). This file is the launch - receipt, then confirm - and the binding;
// the acts are ./scoutAssetActs.ts, the prompts and the brief's door lib/foundry/scout/concept.ts.
//
// WHAT AN ASSET COSTS ON ITS RECEIPT: one line, `concept`, a GPT Image 2.5 Flare still per concept
// (one, or two for a character whose T2 is asked) at lib/imaging/pricing.ts's per-image fallback -
// the scene producer's replica price, the same vendor row (`leonardo-flare`, prefer-only in the
// router, so a Flare refusal is the candidate's sentence and never a quiet second vendor's bill).
// The hand-off and everything after it - TRELLIS.2 through ComfyUI, the Blender finish - run on
// this box and cost $0; they are the mesh store's jobs, admitted by resources, not by money.
//
// ONE JOB PER CANDIDATE AT A TIME, on cloud.leonardo: `job:scout-asset:<night>:<c-NN>`, `~2` after a
// failed one. night.json names it on the candidate and on `night.jobs` once the job exists.

export type AssetTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchAssetOptions = {
  readonly mode: ReceiptMode;
  /** The night's remaining money (lib/foundry/scout/budget.ts), the job's ceiling. */
  readonly ceilingUsd: number;
  /** The techniques the hand-off makes variants for (lib/foundry/mesh/cli-acts.ts `techniquesFor`, already checked). */
  readonly techniques: readonly Technique[];
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type AssetLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The candidate already has a job that is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export const SCOUT_ASSET_LANE: ResourceLane = "cloud.leonardo";

/** Seconds one Flare still takes: the scene producer's measured 15 s, with a poll's slack. */
const STILL_SECONDS = 20;

function conceptOption(): Result<ModelOption> {
  const model = TABLES.image.candidates.find((c) => c.provider === "leonardo-flare")?.models["generate"];
  const price = PRICES.find((p) => p.provider === "leonardo-flare" && p.model === model)?.usdPerImage;
  if (model === undefined || price === undefined) return err("internal", "the router table or the price table has no leonardo-flare row to price a concept with");
  const note = "the per-image fallback (6 credits at USD_PER_CREDIT 0.00257), the scene replica's price; the API's reported credits replace it when booked";
  return ok({
    key: `scout-asset/leonardo-flare/${model}`,
    lane: SCOUT_ASSET_LANE,
    provider: "leonardo-flare",
    model,
    label: "concept still",
    secondsPerUnit: STILL_SECONDS,
    usdPerUnit: price,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "one LOW still, measured 15 s on 2026-10-22, with a poll's slack" }, usd: { src: "illustrative", note } },
  });
}

/* ── The candidate a launch may price ─────────────────────────────────────── */

/** Why `cid` cannot be launched as an asset in `night`; the candidate when it can. */
export function checkAssetCandidate(night: Night, cid: string, mode: ReceiptMode): Result<Asset3dCandidate> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry && mode === "live") return err("refused", `night ${night.id} is dry; a live concept would spend on a packet that commits nothing`);
  const c = night.candidates.find((x) => x.id === cid);
  if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
  if (c.kind !== "asset3d") return err("refused", `${cid} is a ${c.kind} candidate, not a game asset`);
  if (c.status === "rendered" || c.assetId !== undefined) return err("refused", `${cid} already handed off to mesh asset ${c.assetId ?? "(unnamed)"}`);
  return ok(c);
}

function nightOf(id: NightId): Result<Night> {
  try {
    return ok(readNightNow(id));
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 400 ? "invalid" : "unavailable", e.message);
    throw e;
  }
}

/* ── The receipt ──────────────────────────────────────────────────────────── */

type Unsigned = Omit<AssetRequest, "by">;
type ReadAsk = { readonly mode: ReceiptMode; readonly ceilingUsd: number; readonly techniques: readonly Technique[]; readonly now: number };

function readIn(r: Reader, t: AssetTarget, o: ReadAsk): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const c = checkAssetCandidate(night.value, t.candidateId, o.mode);
  if (!c.ok) return c;
  const option = conceptOption();
  if (!option.ok) return option;
  const concepts = conceptsFor(c.value.brief, o.techniques);
  // The key names the candidate AT its prompts: a brief that changed since the receipt is a different line.
  const at = `asset:${night.value.id}/${c.value.id}@${createHash("sha256").update(concepts.map((x) => x.prompt).join("\n")).digest("hex").slice(0, 12)}`;
  const line: PlanLine = { key: `${at}/concept`, label: `concept · ${concepts.length} still(s)`, lane: SCOUT_ASSET_LANE, units: concepts.length, option: option.value, after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode, ceilingUsd: o.ceilingUsd });
  const p = option.value;
  const estimate = p.usdPerUnit === null ? { seconds: p.secondsPerUnit, usd: null, unpricedReason: p.unpricedReason ?? "unpriced" } : { seconds: p.secondsPerUnit, usd: p.usdPerUnit };
  return ok({ receipt, request: { nightId: night.value.id, candidateId: c.value.id, concepts, techniques: [...o.techniques], estimates: { concept: estimate } } });
}

/* ── Jobs of a candidate ──────────────────────────────────────────────────── */

const jobBase = (t: AssetTarget): string => `job:scout-asset:${t.nightId}:${t.candidateId}`;
const jobIdAt = (t: AssetTarget, k: number): string => (k === 1 ? jobBase(t) : `${jobBase(t)}~${k}`);

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

function jobsOf(store: Store, t: AssetTarget): Job[] {
  const out: Job[] = [];
  for (let k = 1; k < 1000; k++) {
    const j = jobOf(store, jobIdAt(t, k));
    if (j === undefined) return out;
    out.push(j);
  }
  throw new AppError("conflict", `asset ${t.nightId}/${t.candidateId} has launched a thousand times`);
}

const FINISHED: ReadonlySet<Job["state"]> = new Set(["done", "failed", "cancelled"]);

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

/** The asset's receipt (no token), or its confirm - lib/producers/scoutScene.ts `launchScene`'s contract. */
export async function launchAsset(store: Store, target: AssetTarget, opts: LaunchAssetOptions): Promise<Result<AssetLaunch>> {
  const now = opts.now ?? Date.now();
  const prior = jobsOf(store, target);
  const held = prior.at(-1);
  if (held !== undefined && !FINISHED.has(held.state)) return ok({ kind: "existing", jobId: held.id, state: held.state });
  const ask: ReadAsk = { mode: opts.mode, ceilingUsd: opts.ceilingUsd, techniques: opts.techniques, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  if (!(opts.ceilingUsd > 0)) return err("refused", `asset ${target.nightId}/${target.candidateId}: the night has $${opts.ceilingUsd.toFixed(2)} left; nothing is launched against it`);
  const token = opts.token;
  const jobId = jobIdAt(target, prior.length + 1);
  const out = store.tx((t): Result<AssetLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `asset receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/${target.candidateId}` }, producer: SCOUT_ASSET, lane: SCOUT_ASSET_LANE, mode: mode.value, ceilingUsd: opts.ceilingUsd }, opts.actor);
    append(t, { actor: opts.actor, type: ASSET_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  // A relaunch starts the candidate over: the failed job's sentence and its concepts go.
  await mutateNight(target.nightId, (n) => {
    const c = n.candidates.find((x): x is Asset3dCandidate => x.id === target.candidateId && x.kind === "asset3d");
    if (c === undefined) return n;
    const { error: _e, ...base } = c;
    const m = withCandidate(n, { ...base, status: "pending", concepts: [], jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export const LIVE_ASSET_ENGINES: AssetEngines = { generate };

/** The request an asset job carries: the event its launch wrote beside the enqueue. */
export function assetRequestOf(store: Store, jobId: string): Result<AssetRequest> {
  const page = queryEvents(store, { type: [ASSET_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no asset request`) : parseAssetRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export function scoutAssetProducer(o: { readonly store?: () => Result<Store>; readonly engines?: AssetEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineScoutAsset(SCOUT_ASSET_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? assetRequestOf(s.value, job.id) : s;
    },
    ...assetActs(o.engines ?? LIVE_ASSET_ENGINES, store),
  });
}

/** Drive one asset job on this process (pipeline/scout.mts after a launch, a test): the worker's rules. */
export function driveAsset(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: AssetEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutAssetProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
