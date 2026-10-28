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
import { defineScoutSheet, parseSheetRequest, SCOUT_SHEET, SHEET_REQUEST, type SheetRequest } from "@gt/producers/scout-sheet/define";

import { drawFlux, FLUX_MODEL, FLUX_SEED_MAX, FLUX_STEPS } from "../imaging/local/flux2.ts";
import { kernel } from "../kernelProcess.ts";
import { FoundryError } from "../foundry/runStore.ts";
import type { KeptCharacter } from "../foundry/scout/characters.ts";
import { SHEET_LATE, sheetPrompt } from "../foundry/scout/sheet.ts";
import { mutateNight, readNightNow, withCandidate } from "../foundry/scout/store.ts";
import type { CandidateId, Night, NightId, SheetCandidate } from "../foundry/scout/types.ts";
import { effectsFor } from "./extract.ts";
import { sheetActs, type SheetActEngines } from "./scoutSheetActs.ts";

// THE SCOUT SHEET PRODUCER, BOUND (spark scout-vision S3) - one `sheet` candidate as one kernel job
// (packages/producers/src/scout-sheet/define.ts says which step). This file is the launch - receipt, then confirm - and
// the binding; the act is ./scoutSheetActs.ts, the act that writes the candidate lib/foundry/scout/sheet.ts.
//
// WHAT A SHEET COSTS ON ITS RECEIPT: one line on gpu.local, `draw`, one Flux 2 dev still at 1:1 on this box's ComfyUI -
// $0, "free: a local model"; its seconds the storyboard frame's illustrative 96 s. The eye's read after it is the
// idea eye's declared call (unpriced on the receipt, as the ideas producer's is). No job ceiling.
//
// ONE JOB PER SHEET, on gpu.local, naming the `comfy` engine: `job:scout-sheet:<night>:<c-NN>`. night.json names it on
// the candidate and on `night.jobs` once the job exists.

export type SheetTarget = { readonly nightId: NightId; readonly candidateId: CandidateId };

export type LaunchSheetOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export type SheetLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The sheet already has its job: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

export const SCOUT_SHEET_LANE: ResourceLane = "gpu.local";

/** Seconds one Flux 2 dev still takes on the card at 20 steps: illustrative, the storyboard frame's (not yet measured). */
const DRAW_SECONDS = 96;

function drawOption(): ModelOption {
  return {
    key: `scout-sheet/comfyui/${FLUX_MODEL}`,
    lane: SCOUT_SHEET_LANE,
    provider: "comfyui",
    model: FLUX_MODEL,
    label: "reference sheet · 1:1 · local",
    secondsPerUnit: DRAW_SECONDS,
    usdPerUnit: 0,
    src: "illustrative",
    basis: {
      seconds: { src: "illustrative", note: `one Flux 2 dev still at ${FLUX_STEPS} steps with one reference on this box's ComfyUI, not yet measured; another session's prompts in its queue stretch it` },
      usd: { src: "real", note: "free: a local model on this box's card; no vendor is paid" },
    },
  };
}

/** The sheet's seed, from its place: a retry draws the same still. */
export function sheetSeed(t: SheetTarget): number {
  return Number.parseInt(createHash("sha256").update(`${t.nightId}/${t.candidateId}/sheet`).digest("hex").slice(0, 12), 16) % (FLUX_SEED_MAX + 1);
}

/* ── The candidate a launch may price ─────────────────────────────────────── */

/** Why `cid` cannot be launched as `k`'s sheet in `night`; the candidate when it can. */
export function checkSheet(night: Night, cid: string, k: KeptCharacter, mode: ReceiptMode): Result<SheetCandidate> {
  if (night.state === "committed") return err("refused", `night ${night.id} is committed; nothing more renders into it`);
  if (night.dry) return err("refused", `night ${night.id} is dry; its sheets are words only and draw no still`);
  if (mode !== "live") return err("refused", `a sheet is drawn live on this box's card (free); a ${mode} receipt draws none`);
  const c = night.candidates.find((x) => x.id === cid);
  if (c === undefined) return err("not-found", `no candidate ${cid} in night ${night.id}`);
  if (c.kind !== "sheet") return err("refused", `${cid} is a ${c.kind} candidate, not a sheet`);
  if (c.status === "rendered") return err("refused", `${cid} is already rendered`);
  if (c.character !== k.key || c.fromPortrait !== k.portrait.ref) return err("refused", `${cid} is ${c.name}'s sheet from ${c.fromPortrait}, not ${k.card.name}'s from ${k.portrait.ref}`);
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

type Unsigned = Omit<SheetRequest, "by">;

function readIn(r: Reader, t: SheetTarget, k: KeptCharacter, o: { readonly mode: ReceiptMode; readonly now: number }): Result<{ readonly receipt: Receipt; readonly request: Unsigned }> {
  const night = nightOf(t.nightId);
  if (!night.ok) return night;
  const c = checkSheet(night.value, t.candidateId, k, o.mode);
  if (!c.ok) return c;
  const prompt = sheetPrompt(k.card);
  // The key names the sheet AT its prompt and portrait: a card or portrait that changed since the receipt is another line.
  const at = `sheet:${night.value.id}/${c.value.id}@${createHash("sha256").update(`${prompt}\n${k.portrait.ref}`).digest("hex").slice(0, 12)}`;
  const line: PlanLine = { key: `${at}/draw`, label: `sheet · ${k.card.name}`, lane: SCOUT_SHEET_LANE, units: 1, option: drawOption(), after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  const request: Unsigned = {
    nightId: night.value.id,
    candidateId: c.value.id,
    character: k.key,
    name: k.card.name,
    portrait: k.portrait.ref,
    prompt,
    seed: sheetSeed(t),
    late: SHEET_LATE,
    ...(k.card.audience === undefined ? {} : { audience: k.card.audience }),
    ...(k.card.kind === "parody" ? { parody: true as const } : {}),
    estimates: { draw: { seconds: DRAW_SECONDS, usd: 0 } },
  };
  return ok({ receipt, request });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export const sheetJobId = (t: SheetTarget): string => `job:scout-sheet:${t.nightId}:${t.candidateId}`;

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The sheet's receipt (no token), or its confirm - lib/producers/scoutPiece.ts `launchPiece`'s contract. */
export async function launchSheet(store: Store, target: SheetTarget, k: KeptCharacter, opts: LaunchSheetOptions): Promise<Result<SheetLaunch>> {
  const now = opts.now ?? Date.now();
  const jobId = sheetJobId(target);
  const held = jobOf(store, jobId);
  if (held !== undefined) return ok({ kind: "existing", jobId, state: held.state });
  const ask = { mode: opts.mode, now };
  const first = store.read((r) => readIn(r, target, k, ask));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value.value.receipt });
  const token = opts.token;
  const out = store.tx((t): Result<SheetLaunch> => {
    const read = readIn(t, target, k, ask);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `sheet receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `scout:${target.nightId}/${target.candidateId}` }, producer: SCOUT_SHEET, lane: SCOUT_SHEET_LANE, mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: SHEET_REQUEST, subject: { kind: "job", id: jobId }, data: { ...read.value.request, by: opts.actor.id } });
    return ok({ kind: "launched", jobId, receipt: read.value.receipt });
  });
  if (!out.ok) return out;
  if (!out.value.ok || out.value.value.kind !== "launched") return out.value;
  await mutateNight(target.nightId, (n) => {
    const c = n.candidates.find((x) => x.id === target.candidateId && x.kind === "sheet");
    if (c === undefined) return n;
    const m = withCandidate(n, { ...c, jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  return out.value;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

/** Production's draw: Flux 2 on this box's ComfyUI at 1:1, the guarded references admitted late. */
export const LIVE_SHEET_DRAW: NonNullable<SheetActEngines["draw"]> = async (prompt, o) => {
  const r = await drawFlux({ prompt, aspect: "1:1", refs: o.refs, late: o.late, ...(o.seed === undefined ? {} : { seed: o.seed }) });
  return { png: r.png, seed: r.seed };
};

/** The request a sheet job carries: the event its launch wrote beside the enqueue. */
export function sheetRequestOf(store: Store, jobId: string): Result<SheetRequest> {
  const page = queryEvents(store, { type: [SHEET_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no sheet request`) : parseSheetRequest(e.data);
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Production's engines are the acts' defaults (Flux on this box's ComfyUI, the imaging router's eye); a test hands fakes. */
export function scoutSheetProducer(o: { readonly store?: () => Result<Store>; readonly engines?: SheetActEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const p = defineScoutSheet(SCOUT_SHEET_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? sheetRequestOf(s.value, job.id) : s;
    },
    ...sheetActs({ draw: LIVE_SHEET_DRAW, ...o.engines }),
  });
  // The still is drawn through ComfyUI: the job names the `comfy` engine (the storyboard producer's rule).
  return { ...p, engine: "comfy" };
}

/** Drive one sheet job on this process (pipeline/scout.mts after a launch, a test): the worker's rules. */
export function driveSheet(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: SheetActEngines } = {}): Promise<Result<RunReport>> {
  const producer = scoutSheetProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
