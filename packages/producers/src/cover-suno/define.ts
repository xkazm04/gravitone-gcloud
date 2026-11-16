import { z } from "zod";

import { coverSunoSendSchema } from "@gt/domain/cover.suno.schema";
import { SUNO_COVER_TAKES, type SunoCoverTakeN } from "@gt/domain/cover.suno";
import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

import { SUNO_CREDITS } from "../suno/producer.ts";

// A COVER'S SUNO SEND AS A PRODUCER (spark suno-covers): one job per send, `job:cover-suno:<cover>:<n>`, on lane
// `cloud.suno` - the winner uploaded once per cover, two covers asked of Suno (song credits), each read for free.
// The pure half, on ./cover/define.ts's shape: the request, the plan of steps not yet booked, the ports.
//
//   upload     the winner's mp3 to Suno (a session, one PUT, a complete), unless the cover already holds its
//              `uploadClipId` - one upload per cover, every send covers it. Free: uploads spend no credits.
//   cover-1,2  one POST /covers each, the owner's style and words; each spends Suno song credits. The idempotency
//              key is `gt-cover-<cover>-<n>-<take>`, so a retried step is one cover, never two.
//   read-1,2   Suno's free analysis, alignment and listen of the take. A refused read is kept on the take; it never
//              fails the send.
//
// RESUMABLE PER STEP. A booked step is never re-run: a drive killed after cover-1 plans cover-2 and the reads, and
// the first cover is not bought twice. The steps run in order: each cover reads the upload clip the first booked.

export const COVER_SUNO = "cover-suno";
export const COVER_SUNO_REQUEST = "audio.cover-suno-requested";
export const COVER_SUNO_LANE = "cloud.suno";

export const UPLOAD_STEP = "upload";
export const coverStep = (take: 1 | 2): string => `cover-${take}`;
export const readStep = (take: 1 | 2): string => `read-${take}`;
/** In order: the upload, then each take's cover and its read. */
export const COVER_SUNO_STEPS = [UPLOAD_STEP, coverStep(1), coverStep(2), readStep(1), readStep(2)] as const;

/** The step's kind and take: `cover-2` is a cover of take 2. Undefined for a step a send does not have. */
export function stepOf(step: string): { readonly kind: "cover" | "read"; readonly take: SunoCoverTakeN } | undefined {
  const m = /^(cover|read)-([12])$/.exec(step);
  if (m === null) return undefined;
  return { kind: m[1] === "cover" ? "cover" : "read", take: m[2] === "1" ? 1 : 2 };
}

const id = z.string().min(1).max(200);
const clipId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);

export const coverSunoRequestSchema = z.strictObject({
  coverId: z.string().regex(/^cov-[0-9a-f]{12}$/),
  /** 1..: the send's place on the cover, and in its job id. */
  n: z.number().int().min(1),
  ...coverSunoSendSchema.shape.plan.shape,
  /** The cover's upload when the launch found one: the upload step is then a reuse. */
  uploadClipId: clipId.optional(),
  takes: z.literal(SUNO_COVER_TAKES),
  by: id,
  estimates: z.strictObject({ upload: estimateSchema, cover: estimateSchema, read: estimateSchema }),
});
export type CoverSunoRequest = Parsed<z.output<typeof coverSunoRequestSchema>>;

export const parseCoverSunoRequest = (raw: unknown): Result<CoverSunoRequest> => parseAt("cover suno request", coverSunoRequestSchema, raw);

/** What is still missing, in order: every step the job has not booked. A cover step is paid in credits. Pure. */
export function coverSunoPlan(req: CoverSunoRequest, outputs: Outputs): MissingStep[] {
  return COVER_SUNO_STEPS.filter((s) => !outputs.has(s)).map((name) => {
    const kind = stepOf(name)?.kind;
    return { name, estimate: name === UPLOAD_STEP ? req.estimates.upload : req.estimates[kind ?? "read"], ...(kind === "cover" ? { credit: SUNO_CREDITS } : {}) };
  });
}

/** The world, bound by lib/producers/coverSuno.ts. */
export type CoverSunoPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<CoverSunoRequest>;
  readonly upload: (req: CoverSunoRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** Take `take`'s cover - SPENDS SONG CREDITS; the launch's confirmed receipt is what lets it run. */
  readonly cover: (req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext) => Promise<StepOutcome>;
  readonly read: (req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext) => Promise<StepOutcome>;
  /** The record told the job's ending. */
  readonly ended: (req: CoverSunoRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the cover producer's shape, one request read per job and kept. */
export function defineCoverSuno(lane: ResourceLane, ports: CoverSunoPorts): Producer {
  const known = new Map<string, Result<CoverSunoRequest>>();
  const requestOf = (job: Job): Result<CoverSunoRequest> => {
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
      const req = known.get(job.id) ?? requestOf(job);
      if (!req.ok) throw req.error;
      return coverSunoPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === UPLOAD_STEP) return ports.upload(req.value, ctx);
      const s = stepOf(step.name);
      if (s?.kind === "cover") return ports.cover(req.value, s.take, ctx);
      if (s?.kind === "read") return ports.read(req.value, s.take, ctx);
      return { kind: "fatal", code: "internal", message: `a cover-suno job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw new AppError(req.error.code, req.error.message);
      await ports.ended(req.value, job, ending);
    },
  };
}
