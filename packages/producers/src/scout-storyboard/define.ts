import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A KEPT IDEA'S STORYBOARD, DRAWN (spark scout-storyboards) - one /scout `storyboard` candidate's frames as
// the steps of ONE kernel job, priced on a receipt before it runs:
//
//   panel:1..N  one Flux 2 dev frame per panel prompt (OUR words, no reference image), drawn on this box's
//               ComfyUI (lib/imaging/local/flux2.ts), written to storyboards/<c-NN>/panel-N.png in the night
//
// ONE JOB, THE CARD'S LANE. Every step is the local model, so the job waits on `gpu.local` (capacity 1) and
// names the `comfy` engine, so admission waits on the ComfyUI queue (the scene producer's clip rule).
//
// ONE PANEL'S FAILURE IS THAT PANEL'S (the ideas producer's rule). A ComfyUI sentence for one prompt leaves
// that panel empty with the sentence recorded, and the step is booked: the storyboard goes on, and a resumed
// job never redraws a panel it already drew or already failed. A storyboard that ends with no frame at all
// is a loss (lib/producers/scoutStoryboardActs.ts `ended`).
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch records the request - each panel's prompt and the seed
// it will draw with (chosen at launch, so a retry draws the same frame), the aspect, one frame's estimate -
// as an event beside the enqueue, in one transaction.

export const SCOUT_STORYBOARD = "scout-storyboard";
/** The event that carries a storyboard job's request (subject: the job). */
export const STORYBOARD_REQUEST = "scout.storyboard-requested";

export const panelStep = (k: number): string => `panel:${k}`;

/** The most frames one storyboard draws (lib/foundry/scout/types.ts STORYBOARD_PANELS_MAX, the operator's five). */
export const STORYBOARD_REQUEST_PANELS_MAX = 5;
export const STORYBOARD_ASPECTS = ["16:9", "9:16"] as const;

const id = z.string().min(1).max(200);

export const storyboardRequestSchema = z
  .object({
    nightId: id,
    candidateId: id,
    aspect: z.enum(STORYBOARD_ASPECTS),
    /** The panels the receipt priced, in order: each one's prompt and seed. */
    panels: z
      .array(z.object({ prompt: z.string().min(1).max(2000), seed: z.number().int().min(0).max(2 ** 48 - 1) }).strict())
      .min(1)
      .max(STORYBOARD_REQUEST_PANELS_MAX),
    /** One frame's estimate: $0, a local model. */
    estimates: z.object({ panel: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type StoryboardRequest = Parsed<z.output<typeof storyboardRequestSchema>>;

export const parseStoryboardRequest = (raw: unknown): Result<StoryboardRequest> => parseAt("storyboard request", storyboardRequestSchema, raw);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function storyboardPlan(req: StoryboardRequest, outputs: Outputs): MissingStep[] {
  return req.panels.map((_, i) => ({ name: panelStep(i + 1), estimate: req.estimates.panel })).filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutStoryboard.ts. */
export type StoryboardPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<StoryboardRequest>;
  readonly panel: (req: StoryboardRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidate told the job's ending: rendered with its frames, or failed with every panel's sentence. */
  readonly ended: (req: StoryboardRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the ideas producer's shape, one request read per job and kept. */
export function defineScoutStoryboard(lane: ResourceLane, ports: StoryboardPorts): Producer {
  const known = new Map<string, Result<StoryboardRequest>>();
  const requestOf = (job: Job): Result<StoryboardRequest> => {
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
      if (req === undefined) throw new AppError("internal", `storyboard job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return storyboardPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const k = step.name.startsWith("panel:") ? Number(step.name.slice("panel:".length)) : NaN;
      if (Number.isInteger(k) && k >= 1 && k <= req.value.panels.length) return ports.panel(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `a storyboard job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
