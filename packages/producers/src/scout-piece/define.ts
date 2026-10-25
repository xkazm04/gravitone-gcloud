import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A GENRE'S PIECE, RENDERED AND CUT (spark scout-vision S2) - one /scout `piece` candidate as the steps of ONE kernel
// job, priced on a receipt before it runs. The piece is the genre's best kept trial in full: every trial panel was
// already clipped, so only the clips the operator REJECTED on that trial (or that failed) are made again.
//
//   clip:N   one LTX clip of trial panel N's own still (OUR panel, never a source), its prompt the motion line and a
//            seed of the piece's own (a re-make is a new take, not the rejected one again), written to
//            pieces/<c-NN>/clip-N.mp4 in the piece's night - only for the indices the request names `remake`
//   cut      every clip in panel order - the kept trial clips copied beside the re-made ones - cut into
//            pieces/<c-NN>/piece.mp4 with the clips' own audio (ffmpeg, normalised so concat never meets two shapes)
//
// ONE CLIP'S FAILURE IS THAT CLIP'S: its index stays null and the cut goes on without it. A cut with no clip at all,
// or a cut ffmpeg refuses, fails the piece - there is nothing to judge.
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch records the request - the trial it renders, each index's still,
// prompt and seed, which to re-make and which kept clip to reuse - as an event beside the enqueue, in one transaction.

export const SCOUT_PIECE = "scout-piece";
/** The event that carries a piece job's request (subject: the job). */
export const PIECE_REQUEST = "scout.piece-requested";

export const pieceClipStep = (k: number): string => `clip:${k}`;
export const CUT_STEP = "cut";

/** The most clips one piece cuts: a trial's panels (lib/foundry/scout/types.ts STORYBOARD_PANELS_MAX). */
export const PIECE_REQUEST_CLIPS_MAX = 5;
export const PIECE_ASPECTS = ["16:9", "9:16"] as const;

const id = z.string().min(1).max(200);
const rel = z.string().min(1).max(500);

export const pieceRequestSchema = z
  .object({
    nightId: id,
    candidateId: id,
    /** The kept trial it renders: its night and its candidate. */
    trial: z.object({ nightId: id, candidateId: id }).strict(),
    aspect: z.enum(PIECE_ASPECTS),
    /** One entry per trial panel, in cut order. */
    clips: z
      .array(
        z
          .object({
            k: z.number().int().min(1).max(PIECE_REQUEST_CLIPS_MAX),
            /** The trial panel's still, relative to the trial's night; null where the panel drew none. */
            still: rel.nullable(),
            prompt: z.string().min(1).max(2000),
            seed: z.number().int().min(0).max(2 ** 48 - 1),
            /** True: rendered again (the operator rejected the trial's clip, or it failed). */
            remake: z.boolean(),
            /** The kept trial clip reused, relative to the trial's night; absent on a re-make. */
            reuse: rel.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(PIECE_REQUEST_CLIPS_MAX),
    /** One re-made clip's estimate and the cut's: $0 each, local tools. */
    estimates: z.object({ clip: estimateSchema, cut: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type PieceRequest = Parsed<z.output<typeof pieceRequestSchema>>;

export const parsePieceRequest = (raw: unknown): Result<PieceRequest> => parseAt("piece request", pieceRequestSchema, raw);

/** What is still missing, in order: every re-make, then the cut. Pure: the request and what the job has booked. */
export function piecePlan(req: PieceRequest, outputs: Outputs): MissingStep[] {
  const clips = req.clips.filter((c) => c.remake && c.still !== null).map((c) => ({ name: pieceClipStep(c.k), estimate: req.estimates.clip }));
  return [...clips, { name: CUT_STEP, estimate: req.estimates.cut }].filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutPiece.ts. */
export type PiecePorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<PieceRequest>;
  readonly clip: (req: PieceRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly cut: (req: PieceRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidate told the job's ending: rendered with its cut, or failed with the job's sentence. */
  readonly ended: (req: PieceRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the storyboard producer's shape, one request read per job and kept. */
export function defineScoutPiece(lane: ResourceLane, ports: PiecePorts): Producer {
  const known = new Map<string, Result<PieceRequest>>();
  const requestOf = (job: Job): Result<PieceRequest> => {
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
      if (req === undefined) throw new AppError("internal", `piece job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return piecePlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === CUT_STEP) return ports.cut(req.value, ctx);
      const k = step.name.startsWith("clip:") ? Number(step.name.slice("clip:".length)) : NaN;
      if (req.value.clips.some((c) => c.k === k && c.remake)) return ports.clip(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `a piece job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
