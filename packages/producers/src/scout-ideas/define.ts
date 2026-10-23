import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A NIGHT'S IDEA ARTBOARDS, DRAWN (spark scout-idea-artboards WP-I2) - one /scout batch of `idea`
// candidates as the steps of ONE kernel job, priced on a receipt before it runs:
//
//   idea:1..N  one rough still per idea in the operator's Leonardo studio, drawn from the idea's
//              prompt (OUR words, no reference image), the studio generation deleted once the
//              pixels are held (lib/imaging/providers/leonardoStudio.ts)
//
// ONE IDEA'S FAILURE IS THAT IDEA'S. A studio sentence for one prompt (a refusal, a timeout) fails
// that candidate with the sentence verbatim and the step is booked: the batch goes on, and a resumed
// job never redraws an idea it already drew or already failed. A studio that is signed out or not
// reachable is everyone's: the step fails the remaining ideas with that one sentence and ends the
// job, rather than asking a dead studio once per idea - a retry from Runs, after signing in, draws
// the steps that were never booked.
//
// The pause holds what the resume needs (the scene and asset producers' rule): the launch records the
// request - each idea's candidate and prompt, and one still's estimate - as an event beside the
// enqueue, in one transaction.
//
// A MUSE BATCH (spark scout-muse) says so on its request, because the worker runs its steps in
// another process and the request is the only thing that reaches it: `wing: "muse"` (absent: the
// scout wing, every request written before the wings), the studio quality it draws at, and each
// idea's aspect when it is not 16:9. The bound acts run every step inside that wing and judge each
// still before it is kept.

export const SCOUT_IDEAS = "scout-ideas";
/** The event that carries an ideas job's request (subject: the job). */
export const IDEAS_REQUEST = "scout.ideas-requested";

export const ideaStep = (k: number): string => `idea:${k}`;

/** What a studio step costs instead of dollars (kernel job-core `MissingStep.credit`). */
export const STUDIO_CREDIT = "studio credits, prepaid";

const id = z.string().min(1).max(200);

/** The most ideas one scout-wing request draws (lib/foundry/scout/types.ts MAX_IDEA_CAP). */
export const SCOUT_REQUEST_MAX = 40;
/** The most one muse-wing request draws (lib/foundry/scout/muse.ts MUSE_MAX_IDEA_CAP). */
export const MUSE_REQUEST_MAX = 50;
/** The imaging contract's aspects (lib/imaging/types.ts Aspect). */
export const IDEA_ASPECTS = ["16:9", "9:16", "1:1", "4:5"] as const;

export const ideasRequestSchema = z
  .object({
    nightId: id,
    /** The scout wing's request names none. */
    wing: z.literal("muse").optional(),
    /** The ideas the receipt priced, in step order; each one's aspect when it is not 16:9. */
    ideas: z
      .array(z.object({ candidateId: id, prompt: z.string().min(1).max(1500), aspect: z.enum(IDEA_ASPECTS).optional() }).strict())
      .min(1)
      .max(MUSE_REQUEST_MAX),
    /** The studio's quality setting (absent: its default). */
    quality: z.enum(["low", "medium"]).optional(),
    /** One still's estimate: unpriced, its reason the studio's prepaid credits. */
    estimates: z.object({ idea: estimateSchema }).strict(),
    by: id,
  })
  .strict()
  .refine((r) => r.wing === "muse" || r.ideas.length <= SCOUT_REQUEST_MAX, { message: `a scout-wing request draws at most ${SCOUT_REQUEST_MAX} ideas`, path: ["ideas"] });
export type IdeasRequest = Parsed<z.output<typeof ideasRequestSchema>>;

export const parseIdeasRequest = (raw: unknown): Result<IdeasRequest> => parseAt("ideas request", ideasRequestSchema, raw);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function ideasPlan(req: IdeasRequest, outputs: Outputs): MissingStep[] {
  return req.ideas.map((_, i) => ({ name: ideaStep(i + 1), estimate: req.estimates.idea, credit: STUDIO_CREDIT })).filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutIdea.ts. */
export type IdeasPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<IdeasRequest>;
  readonly idea: (req: IdeasRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidates told the job's ending: a failure's sentence verbatim on every idea still pending. */
  readonly ended: (req: IdeasRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the asset producer's shape, one request read per job and kept. */
export function defineScoutIdeas(lane: ResourceLane, ports: IdeasPorts): Producer {
  const known = new Map<string, Result<IdeasRequest>>();
  const requestOf = (job: Job): Result<IdeasRequest> => {
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
      if (req === undefined) throw new AppError("internal", `ideas job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return ideasPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const k = step.name.startsWith("idea:") ? Number(step.name.slice("idea:".length)) : NaN;
      if (Number.isInteger(k) && k >= 1 && k <= req.value.ideas.length) return ports.idea(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `an ideas job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
