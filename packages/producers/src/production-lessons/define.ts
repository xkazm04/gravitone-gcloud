import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A DONE PRODUCTION'S LESSONS (spark concept-casting-stages S6), as one step of one kernel job on seat.text: the seat reads
// the production's evidence and proposes one lesson per dimension, naming what each came from.

export const PRODUCTION_LESSONS = "production-lessons";
/** The event carrying a lessons job's request (subject: the job). */
export const LESSONS_REQUEST = "production.lessons-requested";
export const LESSONS_STEP = "lessons";

const id = z.string().min(1).max(200);

export const lessonsRequestSchema = z.object({ productionId: id, by: id, estimates: z.object({ turn: estimateSchema }).strict() }).strict();
export type LessonsRequest = Parsed<z.output<typeof lessonsRequestSchema>>;
export const parseLessonsRequest = (raw: unknown): Result<LessonsRequest> => parseAt("lessons request", lessonsRequestSchema, raw);

export const lessonsPlan = (req: LessonsRequest, outputs: Outputs): MissingStep[] => (outputs.has(LESSONS_STEP) ? [] : [{ name: LESSONS_STEP, estimate: req.estimates.turn }]);

/** The world, bound by lib/producers/productionLessons.ts. */
export type LessonsPorts = {
  readonly request: (job: Job) => Result<LessonsRequest>;
  readonly lessons: (req: LessonsRequest, ctx: StepContext) => Promise<StepOutcome>;
};

export function defineProductionLessons(lane: ResourceLane, ports: LessonsPorts): Producer {
  // plan() runs inside the runner's transaction, so a job's request is read beforehand (in health) and held.
  const known = new Map<string, Result<LessonsRequest>>();
  const requestOf = (job: Job): Result<LessonsRequest> => {
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
      return lessonsPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name !== LESSONS_STEP) return { kind: "fatal", code: "internal", message: `a lessons job has no step ${step.name}` };
      return ports.lessons(req.value, ctx);
    },
    async settle(_job: Job, _ending: Ending) {
      // The step writes the record; nothing is owed when the job ends. A failed job leaves the panel's "propose again".
    },
  };
}

