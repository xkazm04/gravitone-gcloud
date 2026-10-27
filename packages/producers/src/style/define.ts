import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A STYLE ACT AS A JOB (Phase 5 wave B, L54) - the two atelier acts that call out of the studio,
// adopt and generate-proofs, each a kernel job priced on a receipt before it runs (Phase 4 COMMON
// decision 3), so a live render is metered against the job and a dry one is answered by stand-ins
// through the same meter. v1 had neither: the Playground (app/library/Playground.tsx) called
// /api/imaging/generate from the browser and wrote the plate into IndexedDB itself, and the
// Foundry's adopt (POST /api/foundry/styles/<id>/adopt) spent its recognize call with no receipt.
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS (hitl-approval: resume-after-decision). The operator
// confirmed a receipt that named a style at a revision, a block digest and a set of trials; the
// job's request is that, recorded as an event beside the enqueue in one transaction, so a worker
// that picks the job up after a restart renders exactly what was priced - never "the style as it
// is now". The world is re-checked before each paid call: a block rewritten since the receipt
// stops the job with the sentence (nothing more is rendered under a look nobody approved).
//
// THE STEPS, in order (each booked once; a retry performs only what is missing):
//   adopt            `palette` (the recognize read and the seeded forge plates as blobs), `land`
//   generate-proofs  `proof:<trialId>` per chosen trial (one image each, under the CURRENT
//                    block), `land` (the plates appended as PENDING proofs in one write)
// Landing is its own step so a failed write never re-pays the calls before it.

export const STYLE_PRODUCER = "style";
/** The event that carries a style job's request (subject: the job). */
export const STYLE_REQUEST = "style.act-requested";

export const PALETTE_STEP = "palette";
export const LAND_STEP = "land";
export const proofStep = (trialId: string): string => `proof:${trialId}`;

const id = z.string().min(1).max(200);

export const styleRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adopt"), styleId: id, rev: z.number().int().positive(), by: id, estimate: estimateSchema }).strict(),
  z
    .object({
      kind: z.literal("generate-proofs"),
      styleId: id,
      rev: z.number().int().positive(),
      /** The block the receipt priced: every plate must be rendered under it. */
      digest: z.string().min(1),
      /** Each trial once, as the atelier's act door (app/(studio)/library/style/_port/schema.ts) refuses
       *  a repeat: a trial named twice is two priced plates whose landing takes one proof id per trial. */
      trialIds: z
        .array(id)
        .min(1)
        .max(5)
        .refine((ts) => new Set(ts).size === ts.length, { message: "each trial is rendered once per receipt" }),
      by: id,
      /** One plate's estimate. */
      estimate: estimateSchema,
    })
    .strict(),
]);
export type StyleRequest = Parsed<z.output<typeof styleRequestSchema>>;
export type AdoptRequest = Extract<StyleRequest, { kind: "adopt" }>;
export type ProofRequest = Extract<StyleRequest, { kind: "generate-proofs" }>;

const blob = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.number().int().nonnegative(), mime: z.string().min(1) }).strict();

/** One rendered plate, as its step books it. `dry` = the meter answered with the stand-in. */
export const plateOutputSchema = z
  .object({ trialId: id, media: blob, model: z.string().min(1), provider: z.string().min(1), costUsd: z.number().nonnegative().optional(), dry: z.boolean() })
  .strict();
export type PlateOutput = Parsed<z.output<typeof plateOutputSchema>>;

const color = z.object({ name: z.string().min(1), hex: z.string().regex(/^#[0-9a-f]{6}$/i), role: z.enum(["ground", "objects", "accent"]) }).strict();

/** The adopt read, as its step books it: the look and the seeded plates (already blobs). */
export const lookOutputSchema = z
  .object({
    technique: z.string(),
    subject: z.string(),
    finish: z.string(),
    palette: z.array(color).length(3),
    seeds: z.array(z.object({ id, label: z.string().min(1), media: blob, model: z.string().min(1).optional(), note: z.string().min(1).optional() }).strict()),
    leftOut: z.object({ count: z.number().int().positive(), reason: z.string().min(1) }).strict().optional(),
    dry: z.boolean(),
  })
  .strict();
export type LookOutput = Parsed<z.output<typeof lookOutputSchema>>;

/** A booked output read back through its door (outputs are data a crashed drive left). */
export const outputOf = <S extends z.core.$ZodType>(name: string, schema: S, outputs: Outputs): Result<Parsed<z.output<S>>> => parseAt(`style job ${name}`, schema, outputs.get(name)?.value);

const LAND: Estimate = { seconds: 1, usd: 0 };

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function stylePlan(req: StyleRequest, outputs: Outputs): MissingStep[] {
  const work: MissingStep[] =
    req.kind === "adopt" ? [{ name: PALETTE_STEP, estimate: req.estimate }] : req.trialIds.map((t) => ({ name: proofStep(t), estimate: req.estimate }));
  return [...work, { name: LAND_STEP, estimate: LAND }].filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/style.ts: the request read, the calls, the landing. */
export type StylePorts = {
  /** The job's request (its event). Read OUTSIDE the drive's transactions: the kernel plans a job
   *  inside one (job-run.ts `next`), where a second read of the store is refused. */
  readonly request: (job: Job) => Result<StyleRequest>;
  readonly palette: (req: AdoptRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly plate: (req: ProofRequest, trialId: string, ctx: StepContext) => Promise<StepOutcome>;
  readonly land: (req: StyleRequest, ctx: StepContext) => Promise<StepOutcome>;
};

/**
 * The producer. A request never changes once its job exists, so it is read once per job and kept:
 * `health` - which the driver asks before every claim, outside any transaction - reads it, and
 * `plan`, called inside the claim's transaction, takes it from there. A request that cannot be
 * read is not a sick vendor (an unhealthy job would wait forever); the plan fails the job with it.
 * The worker's producer outlives every job, so a request is let go when its job ends (`settle`):
 * a later drive of the same job asks `health` first and reads it again.
 */
export function defineStyleProducer(lane: ResourceLane, ports: StylePorts): Producer {
  const known = new Map<string, Result<StyleRequest>>();
  const requestOf = (job: Job): Result<StyleRequest> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
    // A failed read is kept for the plan to fail the job with, and read again at the next drive.
    const read = ports.request(job);
    known.set(job.id, read);
    return read;
  };
  return {
    lane,
    async health(job) {
      if (job !== undefined) requestOf(job);
      return { ok: true };
    },
    plan(job, outputs) {
      const req = known.get(job.id);
      if (req === undefined) throw new AppError("internal", `style job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return stylePlan(req.value, outputs);
    },
    async settle(job) {
      known.delete(job.id);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const r = req.value;
      if (step.name === LAND_STEP) return ports.land(r, ctx);
      if (r.kind === "adopt" && step.name === PALETTE_STEP) return ports.palette(r, ctx);
      if (r.kind === "generate-proofs" && step.name.startsWith("proof:")) return ports.plate(r, step.name.slice("proof:".length), ctx);
      return { kind: "fatal", code: "internal", message: `a ${r.kind} job has no step ${step.name}` };
    },
  };
}
