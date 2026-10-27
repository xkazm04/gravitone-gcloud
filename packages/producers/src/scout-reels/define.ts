import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A NIGHT'S STATS REELS, AUTHORED (spark stats-reels WP-R1) - one /scout batch of stats ideas (`idea`
// candidates with target `stats`) as the steps of ONE kernel job on the Claude seat, priced on a
// receipt before it runs:
//
//   reel:1..N  per idea, the strips author turn writes the full 8 s strip from the idea's
//              illustrative brief and the seat's own approach (lib/foundry/strips/author.ts, with
//              pipeline/strips/REEL.md beside CONTRACT.md), the frame-purity lint and the data-block
//              rule hold it (one fix turn on a failure), and its frame 120 is rendered cold as the
//              idea's tile (pipeline/strips/render.mts renderFrame)
//
// ONE IDEA'S FAILURE IS THAT IDEA'S (the scout-ideas rule). A turn that ran and left nothing, a strip
// still failing its lint after the fix turn, a frame that would not render: that idea fails with the
// sentence verbatim and its step is booked, the batch goes on, and a resumed job never re-authors an
// idea it already booked. A seat that never served (no binary, signed out) is everyone's: the step
// fails the remaining ideas with that one sentence and ends the job, rather than asking a dead seat
// once per idea - a retry from Runs, after signing in, authors the steps that were never booked. A
// spent usage window is a money stop: the ideas stay pending and the job waits for the window.
//
// The pause holds what the resume needs: the launch records the request - each idea's candidate and
// one reel's estimate - as an event beside the enqueue, in one transaction. The idea's brief and
// approach are files the ideas door wrote (lib/foundry/scout/idea.ts), read by the step.

export const SCOUT_REELS = "scout-reels";
/** The event that carries a reels job's request (subject: the job). */
export const REELS_REQUEST = "scout.reels-requested";

export const reelStep = (k: number): string => `reel:${k}`;

const id = z.string().min(1).max(200);

export const reelsRequestSchema = z
  .object({
    nightId: id,
    /** The ideas the receipt priced, in step order (at most lib/foundry/scout/types.ts MAX_REEL_CAP). */
    reels: z
      .array(z.object({ candidateId: id }).strict())
      .min(1)
      .max(12),
    /** One reel's estimate: its author turn and its one fix turn, at the strips turn's measured figure. */
    estimates: z.object({ reel: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type ReelsRequest = Parsed<z.output<typeof reelsRequestSchema>>;

export const parseReelsRequest = (raw: unknown): Result<ReelsRequest> => parseAt("reels request", reelsRequestSchema, raw);

/**
 * What the ideas door wrote for a stats idea (lib/foundry/scout/types.ts `ReelBrief`: brief.json holds its
 * `brief`, approach.json its `approach`), read back off the night at the step: the door validated it
 * once, and this is the step's own door onto two files a hand may have edited since. The approach's
 * words stay the seat's; which of them the strips card vocabulary takes is the act's mapping
 * (lib/producers/scoutReelActs.ts). The kinds are lib/foundry/scout/types.ts REEL_KINDS (a package
 * does not import lib/).
 */
const words = z.string().trim().min(1).max(2000);
export const reelBriefSchema = z
  .object({
    case: z.string().trim().min(1).max(80),
    title: words,
    hook: words,
    unit: z.string().max(80),
    kind: z.enum(["level-race", "cumulative-race", "counter", "ranking", "share"]),
    data: z.unknown().refine((d) => d !== undefined && d !== null, "the brief holds its numbers in `data`"),
    steps: z.array(z.string()).optional(),
    illustrative: z.literal(true),
  })
  .strict();
export const reelApproachSchema = z.object({ name: words, medium: words, grammar: words, density: words, direction: words, falsifier: words }).strict();
export type ReelBriefIn = Parsed<z.output<typeof reelBriefSchema>>;
export type ReelApproachIn = Parsed<z.output<typeof reelApproachSchema>>;

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function reelsPlan(req: ReelsRequest, outputs: Outputs): MissingStep[] {
  return req.reels.map((_, i) => ({ name: reelStep(i + 1), estimate: req.estimates.reel })).filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutReel.ts. */
export type ReelsPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<ReelsRequest>;
  readonly reel: (req: ReelsRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidates told the job's ending: a failure's sentence verbatim on every idea still pending. */
  readonly ended: (req: ReelsRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the scout-ideas producer's shape, one request read per job and kept. */
export function defineScoutReels(lane: ResourceLane, ports: ReelsPorts): Producer {
  const known = new Map<string, Result<ReelsRequest>>();
  const requestOf = (job: Job): Result<ReelsRequest> => {
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
      if (req === undefined) throw new AppError("internal", `reels job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return reelsPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const k = step.name.startsWith("reel:") ? Number(step.name.slice("reel:".length)) : NaN;
      if (Number.isInteger(k) && k >= 1 && k <= req.value.reels.length) return ports.reel(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `a reels job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
