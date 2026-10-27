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
import { TABLES } from "@gt/kernel/router/tables";
import type { Reader, Store } from "@gt/kernel/store";
import { defineScoutIdeas, IDEAS_REQUEST, parseIdeasRequest, SCOUT_IDEAS, STUDIO_CREDIT, type IdeasRequest } from "@gt/producers/scout-ideas/define";

import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import { wingRunId, type ScoutWing } from "../foundry/scout/wing.ts";
import { activeWing, withWing } from "../foundry/scout/wingScope.ts";
import type { CandidateId, IdeaCandidate, Night, NightId } from "../foundry/scout/types.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { generate, recognize } from "../imaging/router.ts";
import { kernel } from "../kernelProcess.ts";
import { effectsFor } from "./extract.ts";
import { ideaActs, type IdeaEngines } from "./scoutIdeaActs.ts";

// THE SCOUT IDEAS PRODUCER, BOUND (spark scout-idea-artboards WP-I2) - one /scout batch of `idea`
// candidates as one kernel job (packages/producers/src/scout-ideas/define.ts says which steps and
// why one idea's failure is not the batch's). This file is the launch - receipt, then confirm - and
// the binding; the acts are ./scoutIdeaActs.ts, the brief's door lib/foundry/scout/idea.ts.
//
// WHAT A BATCH COSTS ON ITS RECEIPT: one line on box.chrome, `idea`, one Leonardo studio still per
// idea - UNPRICED, because the studio bills its prepaid credits and no USD-per-studio-credit rate has
// been checked (lib/imaging/pricing.ts's leonardo-studio row). The pace is illustrative.
//
// NO JOB CEILING. The night's ceiling caps Gemini only (lib/foundry/scout/budget.ts), and this job
// books none; a ceiling would only make the night hold its whole remainder while the batch draws
// (budget.ts `promiseOf` holds an unfinished live job's ceiling when its receipt has no price).
//
// ONE JOB PER BATCH, on box.chrome: `job:scout-ideas:<night>:<first c-NN>`, and a muse batch's
// `job:scout-ideas:muse:<night>:<first c-NN>` - the two wings number their nights and candidates
// apart, so the same day's first batch in each would otherwise be one id. night.json names it on
// every idea of the batch and on `night.jobs` once the job exists.

export type IdeasTarget = {
  readonly nightId: NightId;
  readonly candidateIds: readonly CandidateId[];
  /** The wing whose night it is; absent: the active one (lib/foundry/scout/wingScope.ts). */
  readonly wing?: ScoutWing;
  /** The studio quality every still of the batch is drawn at; absent: the studio's default. */
  readonly quality?: "low" | "medium";
};

export type LaunchIdeasOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type IdeasLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The batch already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export const SCOUT_IDEAS_LANE: ResourceLane = "box.chrome";

/** Seconds one studio artboard takes: typing, generating, downloading, deleting. Illustrative. */
const IDEA_SECONDS = 45;

function ideaOption(): Result<ModelOption> {
  const model = TABLES.image.candidates.find((c) => c.provider === "leonardo-studio")?.models["generate"];
  if (model === undefined) return err("internal", "the router table has no leonardo-studio row to price an idea with");
  return ok({
    key: `scout-ideas/leonardo-studio/${model}`,
    lane: SCOUT_IDEAS_LANE,
    provider: "leonardo-studio",
    model,
    label: "idea artboard",
    secondsPerUnit: IDEA_SECONDS,
    usdPerUnit: null,
    unpricedReason: STUDIO_CREDIT,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "one studio still with its download and delete, not yet measured" }, usd: { src: "real", note: STUDIO_CREDIT } },
  });
}

/* ── The candidates a launch may price ────────────────────────────────────── */

/** Why the batch cannot be launched in `night`; its ideas, in order, when it can. */
export function checkIdeaCandidates(night: Night, cids: readonly string[], mode: ReceiptMode): Result<IdeaCandidate[]> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry && mode === "live") return err("refused", `night ${night.id} is dry; a live idea would spend on a packet that commits nothing`);
  if (cids.length === 0) return err("invalid", "an ideas batch names at least one idea");
  const out: IdeaCandidate[] = [];
  for (const cid of cids) {
    const c = night.candidates.find((x) => x.id === cid);
    if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
    if (c.kind !== "idea") return err("refused", `${cid} is a ${c.kind} candidate, not an idea`);
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

type Unsigned = Omit<IdeasRequest, "by">;
type ReadAsk = { readonly mode: ReceiptMode; readonly now: number };

function readIn(r: Reader, t: IdeasTarget, o: ReadAsk): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const ideas = checkIdeaCandidates(night.value, t.candidateIds, o.mode);
  if (!ideas.ok) return ideas;
  const option = ideaOption();
  if (!option.ok) return option;
  const asks = ideas.value.map((c) => ({ candidateId: c.id, prompt: c.prompt, ...(c.aspect === undefined || c.aspect === "16:9" ? {} : { aspect: c.aspect }) }));
  // The key names the batch AT its prompts: a prompt that changed since the receipt is a different line.
  const at = `ideas:${night.value.id}/${t.candidateIds[0] ?? ""}@${createHash("sha256").update(asks.map((a) => `${a.candidateId}\n${a.prompt}`).join("\n")).digest("hex").slice(0, 12)}`;
  const line: PlanLine = { key: `${at}/idea`, label: `idea · ${asks.length} artboard(s)`, lane: SCOUT_IDEAS_LANE, units: asks.length, option: option.value, after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const wing = t.wing === "muse" ? { wing: t.wing } : {};
  return ok({ receipt, request: { nightId: night.value.id, ...wing, ideas: asks, ...(t.quality === undefined ? {} : { quality: t.quality }), estimates: { idea: { seconds: IDEA_SECONDS, usd: null, unpricedReason: STUDIO_CREDIT } } } });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export const ideasJobId = (t: IdeasTarget): string => `job:scout-ideas:${wingRunId(t.wing ?? activeWing(), t.nightId)}:${t.candidateIds[0] ?? ""}`;

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The batch's receipt (no token), or its confirm - lib/producers/scoutAsset.ts `launchAsset`'s contract - read and written in the target's wing. */
export function launchIdeas(store: Store, t: IdeasTarget, opts: LaunchIdeasOptions): Promise<Result<IdeasLaunch>> {
  const wing = t.wing ?? activeWing();
  return withWing(wing, () => launchIn(store, { ...t, wing }, opts));
}

async function launchIn(store: Store, target: IdeasTarget, opts: LaunchIdeasOptions): Promise<Result<IdeasLaunch>> {
  const now = opts.now ?? Date.now();
  const jobId = ideasJobId(target);
  const held = jobOf(store, jobId);
  if (held !== undefined) return ok({ kind: "existing", jobId, state: held.state });
  const ask: ReadAsk = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, target, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<IdeasLaunch> => {
    const read = readIn(t, target, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `ideas receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${wingRunId(target.wing ?? activeWing(), target.nightId)}/ideas-${target.candidateIds[0] ?? ""}` }, producer: SCOUT_IDEAS, lane: SCOUT_IDEAS_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: IDEAS_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
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

export const LIVE_IDEA_ENGINES: IdeaEngines = { generate, recognize };

/** The request an ideas job carries: the event its launch wrote beside the enqueue. */
export function ideasRequestOf(store: Store, jobId: string): Result<IdeasRequest> {
  const page = queryEvents(store, { type: [IDEAS_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no ideas request`) : parseIdeasRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export function scoutIdeasProducer(o: { readonly store?: () => Result<Store>; readonly engines?: IdeaEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineScoutIdeas(SCOUT_IDEAS_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? ideasRequestOf(s.value, job.id) : s;
    },
    ...ideaActs(o.engines ?? LIVE_IDEA_ENGINES),
  });
}

/** Drive one ideas job on this process (pipeline/scout.mts after a launch, a test): the worker's rules. */
export function driveIdeas(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: IdeaEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutIdeasProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
