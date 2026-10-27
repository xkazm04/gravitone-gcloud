import { createHash } from "node:crypto";

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
import { defineScoutStoryboard, parseStoryboardRequest, SCOUT_STORYBOARD, STORYBOARD_REQUEST, type StoryboardRequest } from "@gt/producers/scout-storyboard/define";

import { drawFlux, FLUX_MODEL, FLUX_SEED_MAX, FLUX_STEPS } from "../imaging/local/flux2.ts";
import { kernel } from "../kernelProcess.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import type { CandidateId, Night, NightId, StoryboardCandidate } from "../foundry/scout/types.ts";
import { effectsFor } from "./extract.ts";
import { storyboardActs, type StoryboardActEngines } from "./scoutStoryboardActs.ts";

// THE SCOUT STORYBOARD PRODUCER, BOUND (spark scout-storyboards) - one `storyboard` candidate's frames as one
// kernel job (packages/producers/src/scout-storyboard/define.ts says which steps and why one panel's failure
// is not the storyboard's). This file is the launch - receipt, then confirm - and the binding; the acts are
// ./scoutStoryboardActs.ts, the brief's door lib/foundry/scout/storyboard.ts.
//
// WHAT A STORYBOARD COSTS ON ITS RECEIPT: one line on gpu.local, `panel`, one Flux 2 dev frame per panel on
// this box's ComfyUI - $0, src real, "free: a local model" (the scene's local clip rule, scoutScene.ts
// `clipOption`); no spend row is ever booked. The pace is illustrative: 96 s a frame is unmeasured on this
// box (the spark's estimate, ~8 GPU min for five frames); the graph's effort reads the real minutes off the
// job's gpu.local claim events (lib/foundry/scout/effort.ts).
//
// NO JOB CEILING. The night's ceiling caps Gemini only (lib/foundry/scout/budget.ts) and this job books none;
// a job with no ceiling and no run row holds nothing against the night (budget.ts `promiseOf`).
//
// ONE JOB PER STORYBOARD, on gpu.local, naming the `comfy` engine so the worker ADMITS it by that engine's
// measured profile against the machine's load (@gt/domain/resource) - beside a TRELLIS mesh job or an LTX
// clip, not on top of one: `job:scout-storyboard:<night>:<c-NN>`. night.json names it on the candidate and
// on `night.jobs` once the job exists. The storyboard rung is the scout wing's alone (the muse wing has none).

export type StoryboardTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchStoryboardOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type StoryboardLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The storyboard already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export const SCOUT_STORYBOARD_LANE: ResourceLane = "gpu.local";

/** Seconds one Flux 2 dev frame takes on the card at 20 steps: illustrative, not yet measured here. */
const PANEL_SECONDS = 96;

function panelOption(): ModelOption {
  return {
    key: `scout-storyboard/comfyui/${FLUX_MODEL}`,
    lane: SCOUT_STORYBOARD_LANE,
    provider: "comfyui",
    model: FLUX_MODEL,
    label: "storyboard frame · local",
    secondsPerUnit: PANEL_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: {
      seconds: { src: "illustrative", note: `one Flux 2 dev frame at ${FLUX_STEPS} steps on this box's ComfyUI, not yet measured; another session's prompts in its queue stretch it` },
      usd: { src: "real", note: "free: a local model on this box's card; no vendor is paid" },
    },
  };
}

/** A panel's seed, from its place: the same storyboard redraws the same frame on a retry, and the seed is recorded. */
export function panelSeed(t: StoryboardTarget, k: number): number {
  return Number.parseInt(createHash("sha256").update(`${t.nightId}/${t.candidateId}/panel-${k}`).digest("hex").slice(0, 12), 16) % (FLUX_SEED_MAX + 1);
}

/* ── The candidate a launch may price ─────────────────────────────────────── */

/** Why `cid` cannot be launched as a storyboard in `night`; the candidate when it can. */
export function checkStoryboard(night: Night, cid: string, mode: ReceiptMode): Result<StoryboardCandidate> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry) return err("refused", `night ${night.id} is dry; its storyboards are words only and draw no frame`);
  if (mode !== "live") return err("refused", `a storyboard's frames are drawn live on this box's card (free); a ${mode} receipt draws none`);
  const c = night.candidates.find((x) => x.id === cid);
  if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
  if (c.kind !== "storyboard") return err("refused", `${cid} is a ${c.kind} candidate, not a storyboard`);
  if (c.status === "rendered") return err("refused", `${cid} is already rendered`);
  if (c.panels.length === 0) return err("refused", `${cid} has no panel to draw`);
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

type Unsigned = Omit<StoryboardRequest, "by">;

function readIn(r: Reader, t: StoryboardTarget, o: { readonly mode: ReceiptMode; readonly now: number }): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const c = checkStoryboard(night.value, t.candidateId, o.mode);
  if (!c.ok) return c;
  const option = panelOption();
  const panels = c.value.panels.map((prompt, i) => ({ prompt, seed: panelSeed(t, i + 1) }));
  // The key names the storyboard AT its prompts: a prompt that changed since the receipt is a different line.
  const at = `storyboard:${night.value.id}/${c.value.id}@${createHash("sha256").update(c.value.panels.join("\n")).digest("hex").slice(0, 12)}`;
  const line: PlanLine = { key: `${at}/panel`, label: `panel · ${panels.length} frame(s)`, lane: SCOUT_STORYBOARD_LANE, units: panels.length, option, after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const aspect = c.value.aspect === "9:16" ? "9:16" : "16:9";
  return ok({ receipt, request: { nightId: night.value.id, candidateId: c.value.id, aspect, panels, estimates: { panel: { seconds: PANEL_SECONDS, usd: 0 } } } });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export const storyboardJobId = (t: StoryboardTarget): string => `job:scout-storyboard:${t.nightId}:${t.candidateId}`;

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The storyboard's receipt (no token), or its confirm - lib/producers/scoutIdea.ts `launchIdeas`'s contract. */
export async function launchStoryboard(store: Store, target: StoryboardTarget, opts: LaunchStoryboardOptions): Promise<Result<StoryboardLaunch>> {
  const now = opts.now ?? Date.now();
  const jobId = storyboardJobId(target);
  const held = jobOf(store, jobId);
  if (held !== undefined) return ok({ kind: "existing", jobId, state: held.state });
  const ask = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<StoryboardLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `storyboard receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/${target.candidateId}` }, producer: SCOUT_STORYBOARD, lane: SCOUT_STORYBOARD_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: STORYBOARD_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  await mutateNight(target.nightId, (n) => {
    const c = n.candidates.find((x) => x.id === target.candidateId && x.kind === "storyboard");
    if (c === undefined) return n;
    const m = withCandidate(n, { ...c, jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export const LIVE_STORYBOARD_ENGINES: StoryboardActEngines = {
  draw: async (prompt, o) => {
    const r = await drawFlux({ prompt, aspect: o.aspect, ...(o.seed === undefined ? {} : { seed: o.seed }) });
    return { png: r.png, seed: r.seed };
  },
};

/** The request a storyboard job carries: the event its launch wrote beside the enqueue. */
export function storyboardRequestOf(store: Store, jobId: string): Result<StoryboardRequest> {
  const page = queryEvents(store, { type: [STORYBOARD_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no storyboard request`) : parseStoryboardRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export function scoutStoryboardProducer(o: { readonly store?: () => Result<Store>; readonly engines?: StoryboardActEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineScoutStoryboard(SCOUT_STORYBOARD_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? storyboardRequestOf(s.value, job.id) : s;
    },
    ...storyboardActs(o.engines ?? LIVE_STORYBOARD_ENGINES),
  });
  // Every frame is drawn through ComfyUI: the job names the `comfy` engine, so the worker admits it by that
  // engine's measured profile (lib/producers/scoutScene.ts's local clip rule).
  return { ...p, engine: "comfy" };
}

/** Drive one storyboard job on this process (pipeline/scout.mts after a launch, a test): the worker's rules. */
export function driveStoryboard(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: StoryboardActEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutStoryboardProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
