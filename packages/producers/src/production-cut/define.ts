import { z } from "zod";

import { blobRefSchema } from "@gt/domain/blob";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { CUT_FORMATS, PRODUCTION_ASPECTS } from "@gt/domain/production";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A PRODUCTION'S FINAL CUT (spark concept-casting-stages S5) - one kernel job on box.render, priced on a receipt before it
// runs. The format the operator's audio decision implies picks the craft:
//
//   assemble  the trailer script (pipeline/trailer/cut.mts) or the music-clip script (pipeline/music-clip/assemble.mts) over
//             the takes, spawned without a shell, its output kept as a blob.
//   lay       the dub lines and the score over the assembled video, only when there are lines or a bed to lay.
//   land      the video reaches the record and, unless the job was dry, the Board.
//
// The launch records the request (each take's bytes, each line's bytes) beside the enqueue, so a resumed job needs nothing else.

export const PRODUCTION_CUT = "production-cut";
/** The event that carries a cut job's request (subject: the job). */
export const CUT_REQUEST = "production.cut-requested";

export const ASSEMBLE_STEP = "assemble";
export const LAY_STEP = "lay";
export const LAND_STEP = "land";

const id = z.string().min(1).max(200);

const cutTakeSchema = z.object({ takeId: id, video: blobRefSchema, durationS: z.number().positive() }).strict();
const cutLineSchema = z.object({ roleId: id, name: z.string().min(1).max(60), line: z.string().min(1).max(1000), audio: blobRefSchema }).strict();

export const cutRequestSchema = z
  .object({
    productionId: id,
    cutId: id,
    format: z.enum(CUT_FORMATS),
    aspect: z.enum(PRODUCTION_ASPECTS),
    takes: z.array(cutTakeSchema).min(1).max(20),
    /** The dub lines; empty when the route is not dub. */
    lines: z.array(cutLineSchema).max(8),
    /** The music-clip's master, or the score bed under a trailer. */
    track: blobRefSchema.optional(),
    bed: blobRefSchema.optional(),
    /** A native-sound trailer keeps the clips' own sound; `none` silences it. */
    silence: z.boolean(),
    estimates: z.object({ assemble: estimateSchema, lay: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type CutRequest = Parsed<z.output<typeof cutRequestSchema>>;

export const parseCutRequest = (raw: unknown): Result<CutRequest> => parseAt("cut request", cutRequestSchema, raw);

/** Lines or a bed to lay mean a `lay` step; a music-clip's track is already under its picture. */
export const laysAudio = (req: Pick<CutRequest, "lines" | "bed">): boolean => req.lines.length > 0 || req.bed !== undefined;

/** What is still missing, in order: assemble, lay (when there is anything to lay), land. Pure. */
export function cutPlan(req: CutRequest, outputs: Outputs): MissingStep[] {
  const steps: MissingStep[] = [{ name: ASSEMBLE_STEP, estimate: req.estimates.assemble }];
  if (laysAudio(req)) steps.push({ name: LAY_STEP, estimate: req.estimates.lay });
  steps.push({ name: LAND_STEP, estimate: { seconds: 1, usd: 0 } });
  return steps.filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/productionCutActs.ts. */
export type CutPorts = {
  readonly request: (job: Job) => Result<CutRequest>;
  readonly assemble: (req: CutRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly lay: (req: CutRequest, ctx: StepContext) => Promise<StepOutcome>;
  readonly land: (req: CutRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The cut told the job's ending: a failure settles it with the job's sentence. */
  readonly ended: (req: CutRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the take producer's shape, one request read per job and kept. */
export function defineProductionCut(lane: ResourceLane, ports: CutPorts): Producer {
  const known = new Map<string, Result<CutRequest>>();
  const requestOf = (job: Job): Result<CutRequest> => {
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
      if (req === undefined) throw new AppError("internal", `cut job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return cutPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === ASSEMBLE_STEP) return ports.assemble(req.value, ctx);
      if (step.name === LAY_STEP) return ports.lay(req.value, ctx);
      if (step.name === LAND_STEP) return ports.land(req.value, ctx);
      return { kind: "fatal", code: "internal", message: `a cut job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
