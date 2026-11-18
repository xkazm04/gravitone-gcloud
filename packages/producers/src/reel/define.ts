import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema, type Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// THE FOUR REEL JOBS, PURE (spark reel-studio WP2) - one stat reel walked from an idea to its publish copies by four
// kernel jobs, each launched receipt-first from /reels (lib/producers/reel.ts is the door and the binding):
//
//   reel-data     seat.text   data             one seat turn researches a sourced, licensed table for the idea
//   reel-author   seat.text   author           one seat turn writes the film's two pages (and one fix turn on a failed check)
//   reel-render   box.render  stills, render:desktop, render:phone, thumbs
//   reel-release  box.render  mix:desktop, mix:phone, encode:desktop, encode:phone, vmaf
//
// THE PLAN IS THE MISSING OUTPUTS (kernel job-core): a step runs when its output is absent, so a resumed render
// draws only the face that never booked, and a booked turn is never bought twice. A step whose WORK already landed
// without being booked (a master in the state, a page on disk after a paid turn) is adopted by its act, not redone.
//
// ONE JOB PER KIND PER REEL AT A TIME. The id is `job:<kind>:<slug>:<n>`, n counting that kind's launches on that
// reel; a launch while one is open answers with the open job, never a second.
//
// The request the launch froze rides as an event beside the enqueue (REEL_JOB_REQUEST, subject: the job): the reel,
// the operator's send-back note (data), the redo pins in time order (author), and each step's estimate.

export const REEL_JOB_KINDS = ["reel-data", "reel-author", "reel-render", "reel-release"] as const;
export type ReelJobKind = (typeof REEL_JOB_KINDS)[number];

/** The event that carries a reel job's request (subject: the job). */
export const REEL_JOB_REQUEST = "reel.job-requested";

export const REEL_LANES: Readonly<Record<ReelJobKind, ResourceLane>> = { "reel-data": "seat.text", "reel-author": "seat.text", "reel-render": "box.render", "reel-release": "box.render" };

/** Each kind's steps, in the order they run. */
export const REEL_STEPS: Readonly<Record<ReelJobKind, readonly string[]>> = {
  "reel-data": ["data"],
  "reel-author": ["author"],
  "reel-render": ["stills", "render:desktop", "render:phone", "thumbs"],
  "reel-release": ["mix:desktop", "mix:phone", "encode:desktop", "encode:phone", "vmaf"],
};

/** Stills per face across the film, drawn before the masters (the proof look). */
export const STILLS_PER_FACE = 8;
/** Thumbnails per face, spread across each master (the filmstrip). */
export const THUMBS_PER_FACE = 12;
/** `film/progress.json` is rewritten every this many frames written. */
export const PROGRESS_EVERY = 30;

/* ── ids ──────────────────────────────────────────────────────────────────── */

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

export const reelJobId = (kind: ReelJobKind, slug: string, n: number): string => `job:${kind}:${slug}:${n}`;

const ID_RE = /^job:(reel-data|reel-author|reel-render|reel-release):([A-Za-z0-9][A-Za-z0-9_-]{0,59}):([1-9]\d*)$/;

/** A reel job's id read back; undefined for any other id. */
export function parseReelJobId(id: string): { readonly kind: ReelJobKind; readonly slug: string; readonly n: number } | undefined {
  const m = ID_RE.exec(id);
  if (m === null) return undefined;
  return { kind: m[1] as ReelJobKind, slug: m[2] ?? "", n: Number(m[3]) };
}

/** The n the next launch of `kind` on `slug` takes, given the ids that exist. */
export function nextReelJobN(kind: ReelJobKind, slug: string, ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) {
    const p = parseReelJobId(id);
    if (p !== undefined && p.kind === kind && p.slug === slug && p.n > n) n = p.n;
  }
  return n + 1;
}

/* ── the request ──────────────────────────────────────────────────────────── */

const words = z.string().trim().min(1).max(2000);

export const reelPinSchema = z.object({ t: z.number().nonnegative(), reasons: z.array(z.string().min(1).max(40)).max(11), text: z.string().max(2000) }).strict();

export const reelJobRequestSchema = z
  .object({
    slug: z.string().regex(SLUG),
    kind: z.enum(REEL_JOB_KINDS),
    /** reel-data: the operator's words when the table was sent back. */
    note: words.optional(),
    /** reel-author: the redo verdict's pins, in time order. */
    notes: z.array(reelPinSchema).max(200).optional(),
    /** Each step's estimate, by step name. */
    estimates: z.record(z.string(), estimateSchema),
    by: z.string().min(1).max(200),
  })
  .strict()
  .refine((r) => r.note === undefined || r.kind === "reel-data", { message: "only a data job carries a send-back note", path: ["note"] })
  .refine((r) => r.notes === undefined || r.kind === "reel-author", { message: "only an author job carries redo pins", path: ["notes"] })
  .refine((r) => REEL_STEPS[r.kind].every((s) => r.estimates[s] !== undefined), { message: "every step of the job has its estimate", path: ["estimates"] });
export type ReelJobRequest = Parsed<z.output<typeof reelJobRequestSchema>>;

export const parseReelJobRequest = (raw: unknown): Result<ReelJobRequest> => parseAt("reel job request", reelJobRequestSchema, raw);

/** Pins in time order, ties kept in the order they were written. */
export const pinsInTimeOrder = <P extends { readonly t: number }>(pins: readonly P[]): P[] =>
  pins
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.t - b.p.t || a.i - b.i)
    .map((x) => x.p);

/* ── the plan ─────────────────────────────────────────────────────────────── */

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function reelJobPlan(req: ReelJobRequest, outputs: Outputs): MissingStep[] {
  return REEL_STEPS[req.kind]
    .filter((name) => !outputs.has(name))
    .map((name) => {
      const estimate: Estimate = req.estimates[name] ?? { seconds: 0, usd: 0 };
      return { name, estimate, ...(estimate.usd === null ? { credit: estimate.unpricedReason ?? "the operator's seat" } : {}) };
    });
}

/* ── frames ───────────────────────────────────────────────────────────────── */

/** `count` timeline frames spread evenly across a film of `frames`, first and last included, in order and distinct. */
export function spreadFrames(frames: number, count: number): number[] {
  const last = Math.max(0, Math.floor(frames) - 1);
  if (count <= 1 || last === 0) return [Math.floor(last / 2)];
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    const f = Math.round((k * last) / (count - 1));
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** True when a write of progress is due after `frame` of `frames` frames (every PROGRESS_EVERY, and the last). */
export const progressDue = (frame: number, frames: number): boolean => frame === frames || frame % PROGRESS_EVERY === 0;

/** The frames a face's master holds for a timeline of `timeline` frames rendered every `step`-th frame. */
export const faceFrames = (timeline: number, step: number): number => Math.ceil(timeline / Math.max(1, step));

/* ── the producer ─────────────────────────────────────────────────────────── */

/** The world, bound by lib/producers/reel.ts. */
export type ReelJobPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<ReelJobRequest>;
  readonly step: (req: ReelJobRequest, name: string, ctx: StepContext) => Promise<StepOutcome>;
  /** Told the job's ending: a render's progress file is cleared whatever happened. */
  readonly ended?: (req: ReelJobRequest, job: Job, ending: Ending) => Promise<void>;
};

/** One reel job kind as a producer: one request read per job and kept (the scout-reels shape). */
export function defineReelJob(kind: ReelJobKind, ports: ReelJobPorts): Producer {
  const known = new Map<string, Result<ReelJobRequest>>();
  const requestOf = (job: Job): Result<ReelJobRequest> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
    const read = ports.request(job);
    known.set(job.id, read);
    return read;
  };
  return {
    lane: REEL_LANES[kind],
    async health(job) {
      if (job !== undefined) requestOf(job);
      return { ok: true };
    },
    plan(job, outputs) {
      const req = known.get(job.id) ?? requestOf(job);
      if (!req.ok) throw req.error;
      if (req.value.kind !== kind) throw new AppError("internal", `job ${job.id} carries a ${req.value.kind} request, not ${kind}`);
      return reelJobPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (!REEL_STEPS[kind].includes(step.name)) return { kind: "fatal", code: "internal", message: `a ${kind} job has no step ${step.name}` };
      return ports.step(req.value, step.name, ctx);
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended?.(req.value, job, ending);
    },
  };
}
