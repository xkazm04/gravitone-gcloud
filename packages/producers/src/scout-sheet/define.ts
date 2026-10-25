import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A KEPT CHARACTER'S REFERENCE SHEET, DRAWN (spark scout-vision S3) - one /scout `sheet` candidate as ONE step of ONE
// kernel job, priced on a receipt before it runs:
//
//   draw   one Flux 2 dev still at 1:1 on this box's ComfyUI: the prompt her identity block plus the neutral framing
//          (rest expression, three-quarter head, even light, plain field, invariant wardrobe - registry
//          reference-shows-only-invariants), her KEPT PORTRAIT admitted late as the reference (registry
//          reference-admitted-late; OUR picture, read through lib/foundry/scout/cast.ts castStillOf), then read by the
//          eye by her audience's rules before it is kept on disk as sheets/<c-NN>.png in the night.
//
// ONE JOB, THE CARD'S LANE: gpu.local, the `comfy` engine (the storyboard producer's rule).
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch records the request - the character, the portrait ref the receipt
// priced, the compiled prompt, the seed and the late value - as an event beside the enqueue, in one transaction.

export const SCOUT_SHEET = "scout-sheet";
/** The event that carries a sheet job's request (subject: the job). */
export const SHEET_REQUEST = "scout.sheet-requested";
export const SHEET_STEP = "draw";

const id = z.string().min(1).max(200);

export const sheetRequestSchema = z
  .object({
    nightId: id,
    candidateId: id,
    /** The character key (lib/foundry/scout/characters.ts characterKey) and her card's name as written. */
    character: id,
    name: id,
    /** `<runId>/<c-id>` of the kept portrait admitted as the reference (`muse:<night>/c-NN` for the archive). */
    portrait: id,
    /** The compiled prompt: her identity block, then the neutral framing. */
    prompt: z.string().min(1).max(2000),
    seed: z.number().int().min(0).max(2 ** 48 - 1),
    /** Where the portrait joins the denoise, 0..1 (registry reference-admitted-late). */
    late: z.number().min(0).lt(1),
    /** The audience her card is for: the eye's rules (absent: adult, a muse card). */
    audience: z.enum(["kids", "family", "adult"]).optional(),
    /** True when her card is a parody: the eye is told a declared fictional character is not a real person. */
    parody: z.literal(true).optional(),
    /** One still's estimate: $0, a local model. */
    estimates: z.object({ draw: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type SheetRequest = Parsed<z.output<typeof sheetRequestSchema>>;

export const parseSheetRequest = (raw: unknown): Result<SheetRequest> => parseAt("sheet request", sheetRequestSchema, raw);

/** What is still missing: the one draw, unless the job booked it. Pure. */
export function sheetPlan(req: SheetRequest, outputs: Outputs): MissingStep[] {
  return [{ name: SHEET_STEP, estimate: req.estimates.draw }].filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutSheet.ts. */
export type SheetPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<SheetRequest>;
  readonly draw: (req: SheetRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidate told the job's ending: rendered with its still, or failed with the job's sentence. */
  readonly ended: (req: SheetRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the piece producer's shape, one request read per job and kept. */
export function defineScoutSheet(lane: ResourceLane, ports: SheetPorts): Producer {
  const known = new Map<string, Result<SheetRequest>>();
  const requestOf = (job: Job): Result<SheetRequest> => {
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
      if (req === undefined) throw new AppError("internal", `sheet job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return sheetPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === SHEET_STEP) return ports.draw(req.value, ctx);
      return { kind: "fatal", code: "internal", message: `a sheet job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
