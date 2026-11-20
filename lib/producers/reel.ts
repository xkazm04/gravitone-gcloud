// THE /reels LAUNCH DOOR (spark reel-studio): four jobs a reel walks through, each launched receipt-first.
//
//   reel-data     seat.text   a Claude seat turn researches a sourced, licensed table for the idea
//   reel-author   seat.text   a Claude seat turn writes film/reel.html + film/reel-desktop.html (redo notes in time order)
//   reel-render   box.render  steps stills, render:desktop, render:phone, thumbs (the GPU browser; frame progress in film/progress.json)
//   reel-release  box.render  steps mix:desktop, mix:phone, encode:desktop, encode:phone, vmaf
//
// packages/producers/src/reel/define.ts holds the steps, the request and the plan; ./reel/seatActs.ts and
// ./reel/boxActs.ts do the work; this file is the launch (receipt, then confirm), the binding and the screen's read.
//
// WHAT A RECEIPT SAYS. A seat turn is the operator's seat: an UNPRICED line on seat.text, the seat's own report
// booked once the turn ends (the strips rule). A render and a release are local tools on this box: zero-priced lines
// on box.render, still receipt-first so the screen has one gesture for every job. GRAVITONE_DRY_ONLY=1 refuses a
// live launch (kernel armLive); a dry job differs from a live one only at the seat.
//
// A LAUNCH IS REFUSED IN ONE LINE when the reel is not at the stage the job serves (lib/reel/film.ts filmStageOf),
// and answers with the open job when one is: never a second.

import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Estimate } from "@gt/domain/estimate";
import { jobIdSchema } from "@gt/domain/ids";
import { jobSchema, type Job } from "@gt/domain/job";
import { LANE_CAPACITY } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { defineReelJob, nextReelJobN, parseReelJobRequest, reelJobId, REEL_JOB_REQUEST, REEL_LANES, REEL_STEPS, type ReelJobRequest } from "@gt/producers/reel/define";
import { REEL_JOB_KINDS as KINDS, type ReelJobKind as Kind } from "@gt/producers/reel/define";
import { failureOf } from "@gt/producers/research/metered";
import { TURN_ESTIMATE } from "@gt/producers/strips/plan";

import { kernel } from "../kernelProcess.ts";
import { MODEL } from "../model.ts";
import type { FilmStage } from "../reel/film.ts";
import { isReelSlug, readVerdicts, type ReelPin } from "../reel/store.ts";
import type { ReelState } from "../reel/types.ts";
import { effectsFor } from "./extract.ts";
import { releaseStep, renderStep } from "./reel/boxActs.ts";
import { LIVE_REEL_ENGINES, type ReelEngines } from "./reel/engines.ts";
import { clearProgress, readProgress, readState, reelDir } from "./reel/folder.ts";
import { authorAct, dataAct } from "./reel/seatActs.ts";

export type ReelJobKind = Kind;
export const REEL_JOB_KINDS: readonly ReelJobKind[] = KINDS;

export type LaunchReelJobOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  /** reel-author only: the redo verdict's pins, in time order. */
  readonly notes?: readonly ReelPin[];
  /** reel-data only: the operator's words when a table was sent back. */
  readonly note?: string;
  readonly now?: number;
  /** The kernel store; absent: this process's. */
  readonly store?: Store;
  /** The stage machine the launch checks against; absent: lib/reel/film.ts's. */
  readonly engines?: Pick<ReelEngines, "stageOf">;
};

export type ReelJobLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt }
  /** The reel already has this job open: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] };

/** The job id of one kind for one reel: `job:<kind>:<slug>:<n>`, n counting launches of that kind. */
export type ReelJobId = string;

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/* ── what each kind needs, and what it costs ──────────────────────────────── */

/** The stages a kind is launched from, and the sentence that refuses any other. */
const SERVES: Readonly<Record<ReelJobKind, { readonly from: readonly FilmStage[]; readonly refuse: (s: FilmStage) => string }>> = {
  "reel-data": { from: ["idea", "data"], refuse: (s) => `the reel is past its data (${s})` },
  "reel-author": { from: ["authoring", "redo", "rendering"], refuse: (s) => (s === "idea" || s === "data" ? "the reel has no kept table yet" : `the film is at ${s}, not waiting for pages`) },
  "reel-render": { from: ["rendering"], refuse: (s) => (s === "idea" || s === "data" || s === "authoring" || s === "redo" ? "the film has no pages yet" : `the film is at ${s}, not waiting for a render`) },
  // `sound` is a kept film whose copies do not carry its bed yet (lib/reel/film.ts): the release job makes them.
  "reel-release": { from: ["sound"], refuse: (s) => (s === "release" || s === "released" ? `the film's copies are made (${s})` : `the film is at ${s}, not kept yet`) },
};

/** Seconds a frame takes on this box's card: measured 0.59 s at 1920x1080 on The Strait, 2026-11-18 (WP2 acceptance). */
const FRAME_SECONDS = 0.6;

const seat = (turns: number): Estimate => ({ seconds: turns * TURN_ESTIMATE.seconds, usd: null, unpricedReason: "the operator's seat, reported by the seat after the turn" });
const local = (seconds: number): Estimate => ({ seconds: Math.round(seconds), usd: 0 });

function estimatesOf(kind: ReelJobKind, state: ReelState): Record<string, Estimate> {
  const frames = state.film?.frames ?? 1800;
  switch (kind) {
    case "reel-data":
      return { data: seat(1) };
    case "reel-author":
      return { author: seat(2) };
    case "reel-render":
      return { stills: local(16 * 3 + 30), "render:desktop": local(frames * FRAME_SECONDS), "render:phone": local((frames / 2) * FRAME_SECONDS), thumbs: local(30) };
    case "reel-release":
      // 2-pass x264 to 50 MB of a 100 s master: 44 s measured (lib/reel/encode.ts header).
      return { "mix:desktop": local(30), "mix:phone": local(20), "encode:desktop": local(45), "encode:phone": local(30), vmaf: local(120) };
  }
}

function optionOf(kind: ReelJobKind, step: string, e: Estimate): ModelOption {
  const lane = REEL_LANES[kind];
  if (e.usd === null) {
    return {
      key: `${kind}/claude-seat/${MODEL}`,
      lane,
      provider: "claude-seat",
      model: MODEL,
      label: `${step} · seat turn`,
      secondsPerUnit: e.seconds,
      usdPerUnit: null,
      unpricedReason: e.unpricedReason ?? "the operator's seat",
      src: "model",
      basis: { seconds: { src: "real", note: "strips-r1: 879 s of seat a turn", measuredAt: "2026-10-06" }, usd: { src: "real", note: "the operator's seat: reported after the turn, never capped" } },
    };
  }
  return {
    key: `${kind}/local/${step}`,
    lane,
    provider: "local",
    model: step,
    label: `${step} · local`,
    secondsPerUnit: e.seconds,
    usdPerUnit: 0,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "0.6 s a frame on this box's card, measured on one film" }, usd: { src: "real", note: "free: a local tool on this box; no vendor is paid" } },
  };
}

/* ── the jobs a reel has ──────────────────────────────────────────────────── */

const isOpen = (s: Job["state"]): boolean => s !== "done" && s !== "failed" && s !== "cancelled";

/** Every job of `kind` on `slug`, in launch order. */
function jobsOfKind(r: Reader, kind: ReelJobKind, slug: string): Job[] {
  const rows = r.all("SELECT record FROM jobs WHERE id LIKE ? ORDER BY n", `job:${kind}:${slug}:%`);
  const out: Job[] = [];
  for (const row of rows) {
    const j = parseAt("job record", jobSchema, JSON.parse(String(row["record"])) as unknown);
    if (j.ok && j.value.id.split(":")[2] === slug) out.push(j.value);
  }
  return out;
}

/* ── launch: receipt, then confirm ────────────────────────────────────────── */

type Ask = { readonly mode: ReceiptMode; readonly now: number; readonly kind: ReelJobKind; readonly slug: string; readonly state: ReelState; readonly body: Omit<ReelJobRequest, "by"> };

function receiptIn(r: Reader, a: Ask): Receipt {
  const key = `reel:${a.kind}:${a.slug}@${createHash("sha256").update(JSON.stringify([a.body, a.state.tableSha ?? "", a.state.film?.frames ?? 0, a.state.film?.bed?.sha ?? ""])).digest("hex").slice(0, 12)}`;
  const steps = REEL_STEPS[a.kind];
  const lines: PlanLine[] = steps.map((step, i) => {
    const e = a.body.estimates[step] ?? local(0);
    return { key: `${key}/${step}`, label: step, lane: REEL_LANES[a.kind], units: 1, option: optionOf(a.kind, step, e), after: i === 0 ? [] : [`${key}/${steps[i - 1] ?? ""}`], order: i, status: "pending" };
  });
  return receiptFor({ subject: { kind: "run", lane: "video" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: a.now, mode: a.mode });
}

/** The reel's job of `kind`: its receipt (no token), or its confirm. */
export async function launchReelJob(kind: ReelJobKind, slug: string, opts: LaunchReelJobOptions): Promise<Result<ReelJobLaunch>> {
  if (!REEL_JOB_KINDS.includes(kind)) return err("invalid", `there is no reel job ${String(kind)}`);
  if (!isReelSlug(slug)) return err("not-found", "That is not a reel.");
  if (opts.note !== undefined && kind !== "reel-data") return err("invalid", "only a data job takes a send-back note");
  if (opts.notes !== undefined && kind !== "reel-author") return err("invalid", "only an author job takes pinned notes");
  const s = opts.store === undefined ? processStore() : ok(opts.store);
  if (!s.ok) return s;
  const store = s.value;
  const open = store.read((r) => jobsOfKind(r, kind, slug).filter((j) => isOpen(j.state)).at(-1));
  if (!open.ok) return open;
  if (open.value !== undefined) return ok({ kind: "existing", jobId: open.value.id, state: open.value.state });

  const dir = reelDir(slug);
  let state: ReelState;
  let stage: FilmStage;
  try {
    state = await readState(dir);
    stage = (opts.engines?.stageOf ?? LIVE_REEL_ENGINES.stageOf)(state, await readVerdicts(dir));
  } catch (x) {
    return err("not-found", x instanceof Error ? x.message : String(x));
  }
  const serves = SERVES[kind];
  if (!serves.from.includes(stage)) return err("refused", serves.refuse(stage));
  if (kind === "reel-release" && state.film?.bed === undefined) return err("refused", "the film has no bed yet");

  const note = opts.note?.trim();
  const body: Omit<ReelJobRequest, "by"> = {
    slug,
    kind,
    ...(note === undefined || note === "" ? {} : { note }),
    ...(opts.notes === undefined ? {} : { notes: opts.notes.map((p) => ({ t: p.t, reasons: [...p.reasons], text: p.text })) }),
    estimates: estimatesOf(kind, state),
  };
  const ask: Ask = { mode: opts.mode, now: opts.now ?? Date.now(), kind, slug, state, body };
  const first = store.read((r) => receiptIn(r, ask));
  if (!first.ok) return first;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: first.value });
  const token = opts.token;
  const out = store.tx((t): Result<ReelJobLaunch> => {
    const receipt = receiptIn(t, ask);
    if (receipt.token !== token) return ok({ kind: "stale", fresh: receipt });
    const mode = opts.mode === "dry" ? ok(DRY) : armLive(opts.actor, t.at, `${kind} receipt ${token.slice(0, 12)} confirmed`, { dryOnly: opts.dryOnly });
    if (!mode.ok) return mode;
    const ids = t.all("SELECT id FROM jobs WHERE id LIKE ?", `job:${kind}:${slug}:%`).map((row) => String(row["id"]));
    const jobId = reelJobId(kind, slug, nextReelJobN(kind, slug, ids));
    const parsed = parseAt("job id", jobIdSchema, jobId);
    if (!parsed.ok) return parsed;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `reel:${slug}/${kind}` }, producer: kind, lane: REEL_LANES[kind], mode: mode.value }, opts.actor);
    append(t, { actor: opts.actor, type: REEL_JOB_REQUEST, subject: { kind: "job", id: jobId }, data: JSON.parse(JSON.stringify({ ...body, by: opts.actor.id })) });
    return ok({ kind: "launched", jobId, receipt });
  });
  if (!out.ok) return out;
  return out.value;
}

/* ── the screen's read ────────────────────────────────────────────────────── */

/** The open and latest jobs of a reel, for the screen: kind, state, and the render's frame progress when one runs. */
export type ReelJobView = {
  readonly kind: ReelJobKind;
  readonly jobId: string;
  readonly state: Job["state"];
  readonly progress?: { readonly face: "desktop" | "phone"; readonly frame: number; readonly frames: number };
  /** The job's last error, verbatim. */
  readonly error?: string;
};

/** The latest job of each kind the reel has, in the kinds' order. */
export async function reelJobsOf(slug: string, o: { readonly store?: Store } = {}): Promise<readonly ReelJobView[]> {
  if (!isReelSlug(slug)) return [];
  const s = o.store === undefined ? processStore() : ok(o.store);
  if (!s.ok) throw s.error;
  const latest = s.value.read((r) => REEL_JOB_KINDS.map((kind) => jobsOfKind(r, kind, slug).at(-1)).filter((j): j is Job => j !== undefined));
  if (!latest.ok) throw latest.error;
  const views: ReelJobView[] = [];
  for (const job of latest.value) {
    const kind = job.producer as ReelJobKind;
    const p = kind === "reel-render" && job.state === "running" ? await readProgress(reelDir(slug)) : undefined;
    views.push({ kind, jobId: job.id, state: job.state, ...(p === undefined ? {} : { progress: { face: p.face, frame: p.frame, frames: p.frames } }), ...(job.error === undefined ? {} : { error: job.error.message }) });
  }
  return views;
}

/* ── the binding ──────────────────────────────────────────────────────────── */

/** The request a reel job carries: the event its launch wrote beside the enqueue. */
export function reelJobRequestOf(store: Store, jobId: string): Result<ReelJobRequest> {
  const page = queryEvents(store, { type: [REEL_JOB_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no reel request`) : parseReelJobRequest(e.data);
}

/** One kind's bound producer - the lines lib/producers/registry.ts carries. */
export function reelJobProducer(kind: ReelJobKind, o: { readonly store?: () => Result<Store>; readonly engines?: ReelEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const e = o.engines ?? LIVE_REEL_ENGINES;
  return defineReelJob(kind, {
    request: (job) => {
      const s = store();
      return s.ok ? reelJobRequestOf(s.value, job.id) : s;
    },
    step: async (req, name, ctx) => {
      const dir = reelDir(req.slug);
      try {
        if (req.kind === "reel-data") return await dataAct(e, req, dir, ctx);
        if (req.kind === "reel-author") return await authorAct(e, req, dir, ctx);
        if (req.kind === "reel-render") return await renderStep(e, name, dir, ctx);
        return await releaseStep(e, name, dir, ctx);
      } catch (x) {
        return failureOf(x);
      }
    },
    ended: async (req) => {
      if (req.kind === "reel-render") await clearProgress(reelDir(req.slug));
    },
  });
}

/** Drive one reel job on this process (a test, a CLI): the worker's rules. */
export function driveReelJob(store: Store, location: string, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: ReelEngines } = {}): Promise<Result<RunReport>> {
  const kind = jobId.split(":")[1] as ReelJobKind;
  const producer = reelJobProducer(kind, { store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
