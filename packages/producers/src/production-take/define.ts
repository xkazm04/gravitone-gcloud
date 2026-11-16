import { z } from "zod";

import { blobRefSchema } from "@gt/domain/blob";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { TAKE_KINDS } from "@gt/domain/production";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// ONE TAKE OF A PRODUCTION (spark concept-casting-stages S1) - a kept concept's video iteration as the steps of ONE
// kernel job on gpu.local, priced on a receipt before it runs.
//
//   hero   one clip: the frame(s) the operator chose, first-and-last or first-frame only, through H3. The clip IS the take.
//   rough  one clip per beat, in order, each from its own panel, then `cut`: every clip that rendered cut into one rough
//          video. A clip's failure is that clip's; a rough cut with no clip at all fails the take.
//
// Every clip of a take runs on the take's one seed, the seed recorded on the take; a retry of the job renders the same
// clip. The launch records the request (the frames by their bytes, each clip's words) as an event beside the enqueue,
// in one transaction, so a resumed job needs nothing else.

export const PRODUCTION_TAKE = "production-take";
/** The event that carries a take job's request (subject: the job). */
export const TAKE_REQUEST = "production.take-requested";

export const clipStep = (k: number): string => `clip:${k}`;
export const CUT_STEP = "cut";

/** The most beats a rough cut covers: a board's panels. */
export const TAKE_CLIPS_MAX = 5;
export const TAKE_ASPECTS = ["16:9", "9:16"] as const;

const id = z.string().min(1).max(200);

const clipSchema = z
  .object({
    k: z.number().int().min(1).max(TAKE_CLIPS_MAX),
    beat: z.string().min(1),
    /** The clip's first frame, by its bytes. */
    first: blobRefSchema,
    /** Its last frame, when the operator chose two. */
    last: blobRefSchema.optional(),
    prompt: z.string().min(1).max(4000),
    /** A speaking take (S5, behind the voice proof): `first` is the character's still, this the voice line, rendered through ref2va. */
    speaking: z.object({ voice: blobRefSchema }).strict().optional(),
  })
  .strict();

export const takeRequestSchema = z
  .object({
    productionId: id,
    takeId: id,
    kind: z.enum(TAKE_KINDS),
    aspect: z.enum(TAKE_ASPECTS),
    seed: z.number().int().nonnegative(),
    clips: z.array(clipSchema).min(1).max(TAKE_CLIPS_MAX),
    /** One clip's estimate and the cut's: $0 each, local tools. */
    estimates: z.object({ clip: estimateSchema, cut: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type TakeRequest = Parsed<z.output<typeof takeRequestSchema>>;

export const parseTakeRequest = (raw: unknown): Result<TakeRequest> => parseAt("take request", takeRequestSchema, raw);

/** What is still missing, in order: each clip, then a rough cut's cut. Pure: the request and what the job has booked. */
export function takePlan(req: TakeRequest, outputs: Outputs): MissingStep[] {
  const clips: MissingStep[] = req.clips.map((c) => ({ name: clipStep(c.k), estimate: req.estimates.clip }));
  const cut: MissingStep[] = req.kind === "rough" ? [{ name: CUT_STEP, estimate: req.estimates.cut }] : [];
  return [...clips, ...cut].filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/productionActs.ts. */
export type TakePorts = {
  readonly request: (job: Job) => Result<TakeRequest>;
  readonly clip: (req: TakeRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly cut: (req: TakeRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The take told the job's ending: a failure settles it with the job's sentence. */
  readonly ended: (req: TakeRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the storyboard producer's shape, one request read per job and kept. */
export function defineProductionTake(lane: ResourceLane, ports: TakePorts): Producer {
  const known = new Map<string, Result<TakeRequest>>();
  const requestOf = (job: Job): Result<TakeRequest> => {
    const held = known.get(job.id);
    if (held?.ok === true) return held;
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
      if (req === undefined) throw new AppError("internal", `take job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return takePlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === CUT_STEP) return ports.cut(req.value, ctx);
      const k = step.name.startsWith("clip:") ? Number(step.name.slice("clip:".length)) : NaN;
      if (req.value.clips.some((c) => c.k === k)) return ports.clip(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `a take job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
