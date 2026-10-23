import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
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
import type { Reader, Store } from "@gt/kernel/store";
import { defineScoutReels, parseReelsRequest, REELS_REQUEST, SCOUT_REELS, type ReelsRequest } from "@gt/producers/scout-reels/define";
import { TURN_ESTIMATE } from "@gt/producers/strips/plan";

import { runAgent } from "../agent/cliSeam.ts";
import { mutateNight, readNightNow, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { CandidateId, IdeaCandidate, Night, NightId, ReelFiles } from "../foundry/scout/types.ts";
import { FoundryError } from "../foundry/runStore.ts";
import type { StripLane } from "../foundry/strips/types.ts";
import { kernel } from "../kernelProcess.ts";
import { MODEL } from "../model.ts";
import { effectsFor } from "./extract.ts";
import { reelActs, type ReelEngines } from "./scoutReelActs.ts";

// THE SCOUT REELS PRODUCER, BOUND (spark stats-reels WP-R1) - one /scout batch of stats ideas (`idea`
// candidates with target `stats`) as one kernel job on the Claude seat: per idea, the strips author
// turn (lib/foundry/strips/author.ts) writes the full 8 s strip from the idea's illustrative brief and
// the seat's own approach, the lint and the data-block rule hold it (one fix turn on a failure), and
// its frame 120 is rendered cold as the idea's tile (pipeline/strips/render.mts renderFrame).
// packages/producers/src/scout-reels/define.ts says which steps and why one idea's failure is not the
// batch's; this file is the launch - receipt, then confirm - and the binding; the acts are
// ./scoutReelActs.ts.
//
// The ideas door (lib/foundry/scout/idea.ts, WP-R2) writes each stats idea's inputs to `reelFiles(cid)`
// - brief.json and approach.json - and sets the candidate's `reel` BEFORE it calls launchReels; the job
// reads them there and writes strip.html (+ style.json) beside them and the tile to `ideas/<cid>.png`.
//
// WHAT A BATCH COSTS ON ITS RECEIPT: one line on seat.text, `reel`, one unit per idea, priced at its
// worst case - the author turn and the one fix turn, each at the strips turn's measured figure
// (packages/producers/src/strips/plan.ts TURN_ESTIMATE, strips-r1) - plus one cold frame. The seat's
// own report replaces the figure once a turn ends.
//
// NO JOB CEILING. The night's ceiling caps Gemini only (lib/foundry/scout/budget.ts, 19b0b8e1): the
// seat is the operator's plan, REPORTED and never capped. The job carries no ceiling and no Run row,
// so the night holds none of its remainder for it (budget.ts `promiseOf`), and every turn it books
// names `claude-seat/<model>` on its model axis, so its dollars read as uncapped.
//
// ONE JOB PER BATCH, on seat.text: `job:scout-reels:<night>:<first c-NN>`. night.json names it on every
// idea of the batch and on `night.jobs` once the job exists.

export type ReelsTarget = { readonly nightId: NightId; readonly candidateIds: readonly CandidateId[] };

export type LaunchReelsOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type ReelsLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The batch already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/** The seat's lane: the strips producer's (packages/producers/src/strips/define.ts), capacity 4. */
export const SCOUT_REELS_LANE: ResourceLane = "seat.text";

/** A stats idea's directory, night-relative. */
export const reelDir = (cid: CandidateId): string => `ideas/${cid}`;

/** Where a stats idea's inputs and strip live, night-relative (the candidate's `reel`, strip once written). */
export const reelFiles = (cid: CandidateId): Required<ReelFiles> => ({ brief: `${reelDir(cid)}/brief.json`, approach: `${reelDir(cid)}/approach.json`, strip: `${reelDir(cid)}/strip.html` });

/** The tile: the strip's frame 120, beside the studio artboards (lib/producers/scoutIdeaActs.ts ideaFile). */
export const reelTile = (cid: CandidateId): string => `ideas/${cid}.png`;

/** The frame the tile shows: renderStrip's poster frame. */
export const REEL_TILE_FRAME = 120;

export const reelsJobId = (t: ReelsTarget): string => `job:scout-reels:${t.nightId}:${t.candidateIds[0] ?? ""}`;

/** Turns a reel buys at most: its author turn and one fix turn. */
const REEL_TURNS = 2;
/** Seconds one cold frame takes: a Chromium launch, the page's setup, one screenshot. Illustrative. */
const FRAME_SECONDS = 10;
const REEL_SECONDS = REEL_TURNS * TURN_ESTIMATE.seconds + FRAME_SECONDS;
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const REEL_USD = round6(REEL_TURNS * (TURN_ESTIMATE.usd ?? 0));
const REEL_USD_RANGE: readonly [number, number] = [round6(TURN_ESTIMATE.usdRange?.[0] ?? 0), round6(REEL_TURNS * (TURN_ESTIMATE.usdRange?.[1] ?? 0))];

function reelOption(): ModelOption {
  return {
    key: `scout-reels/claude-seat/${MODEL}`,
    lane: SCOUT_REELS_LANE,
    provider: "claude-seat",
    model: MODEL,
    label: "stats reel · worst case",
    secondsPerUnit: REEL_SECONDS,
    usdPerUnit: REEL_USD,
    usdRangePerUnit: REEL_USD_RANGE,
    src: "model",
    basis: {
      seconds: { src: "real", note: "strips-r1: 879 s of seat a turn; the cold frame is not yet measured", measuredAt: "2026-10-06" },
      usd: { src: "model", note: `${REEL_TURNS} seat turn(s) a reel at the measured $${TURN_ESTIMATE.usd} each, the seat's own report replacing it` },
    },
  };
}

/* ── The candidates a launch may price ────────────────────────────────────── */

/** Why the batch cannot be launched in `night`; its stats ideas, in order, when it can. */
export function checkReelCandidates(night: Night, cids: readonly string[], mode: ReceiptMode): Result<IdeaCandidate[]> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry && mode === "live") return err("refused", `night ${night.id} is dry; a live reel would spend on a packet that commits nothing`);
  if (cids.length === 0) return err("invalid", "a reels batch names at least one idea");
  const out: IdeaCandidate[] = [];
  for (const cid of cids) {
    const c = night.candidates.find((x) => x.id === cid);
    if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
    if (c.kind !== "idea") return err("refused", `${cid} is a ${c.kind} candidate, not an idea`);
    if (c.target !== "stats") return err("refused", `${cid} is a ${c.target} idea, not a stats reel`);
    const f = reelFiles(c.id);
    for (const rel of [f.brief, f.approach]) if (!existsSync(resolveInNight(night.id, rel))) return err("not-found", `${cid}: ${rel} is not in night ${night.id}`);
    out.push(c);
  }
  return ok(out);
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

type Unsigned = Omit<ReelsRequest, "by">;
type ReadAsk = { readonly mode: ReceiptMode; readonly now: number };

function readIn(r: Reader, t: ReelsTarget, o: ReadAsk): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const ideas = checkReelCandidates(night.value, t.candidateIds, o.mode);
  if (!ideas.ok) return ideas;
  // The key names the batch AT its inputs: a brief or approach that changed since the receipt is a different line.
  const h = createHash("sha256");
  for (const c of ideas.value) {
    const f = reelFiles(c.id);
    h.update(`${c.id}\n`).update(readFileSync(resolveInNight(night.value.id, f.brief))).update(readFileSync(resolveInNight(night.value.id, f.approach)));
  }
  const at = `reels:${night.value.id}/${t.candidateIds[0] ?? ""}@${h.digest("hex").slice(0, 12)}`;
  const n = ideas.value.length;
  const line: PlanLine = { key: `${at}/reel`, label: `reel · ${n} stats reel(s)`, lane: SCOUT_REELS_LANE, units: n, option: reelOption(), after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "video" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  return ok({ receipt, request: { nightId: night.value.id, reels: ideas.value.map((c) => ({ candidateId: c.id })), estimates: { reel: { seconds: REEL_SECONDS, usd: REEL_USD, usdRange: [...REEL_USD_RANGE] } } } });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The batch's receipt (no token), or its confirm - lib/producers/scoutIdea.ts `launchIdeas`'s contract. */
export async function launchReels(store: Store, target: ReelsTarget, opts: LaunchReelsOptions): Promise<Result<ReelsLaunch>> {
  const now = opts.now ?? Date.now();
  const jobId = reelsJobId(target);
  const held = jobOf(store, jobId);
  if (held !== undefined) return ok({ kind: "existing", jobId, state: held.state });
  const ask: ReadAsk = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<ReelsLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `reels receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/reels-${target.candidateIds[0] ?? ""}` }, producer: SCOUT_REELS, lane: SCOUT_REELS_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: REELS_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  const ids = new Set(target.candidateIds);
  await mutateNight(target.nightId, (n) => {
    let m = n;
    for (const c of n.candidates) if (ids.has(c.id) && c.kind === "idea") m = withCandidate(m, { ...c, jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** The real frame: one headless Chromium per call, closed after (render.mts says why its flags). */
async function realFrame(htmlPath: string, lane: StripLane, i: number): Promise<Buffer> {
  const r = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "../../pipeline/strips/render.mts");
  const browser = await r.launchHeadless();
  try {
    return await r.renderFrame({ browser, htmlPath, lane, i });
  } finally {
    await browser.close();
  }
}

export const LIVE_REEL_ENGINES: ReelEngines = { seat: runAgent, frame: realFrame };

const LAYOUT = { files: reelFiles, tile: reelTile, frame: REEL_TILE_FRAME };

/** The request a reels job carries: the event its launch wrote beside the enqueue. */
export function reelsRequestOf(store: Store, jobId: string): Result<ReelsRequest> {
  const page = queryEvents(store, { type: [REELS_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no reels request`) : parseReelsRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** The bound producer - the one line lib/producers/registry.ts carries. */
export function scoutReelsProducer(o: { readonly store?: () => Result<Store>; readonly engines?: ReelEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineScoutReels(SCOUT_REELS_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? reelsRequestOf(s.value, job.id) : s;
    },
    ...reelActs(o.engines ?? LIVE_REEL_ENGINES, LAYOUT),
  });
}

/** Drive one reels job on this process (a test, or pipeline/scout.mts when not detached): the worker's rules. */
export async function driveReels(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: ReelEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutReelsProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
