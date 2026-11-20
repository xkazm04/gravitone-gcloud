import { AppError, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { SleeveRequest } from "@gt/domain/release.sleeve";
import type { MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A RELEASE'S SLEEVE TAKES, DRAWN (spark studio-to-release WP3) - one press of the sleeve step's "N takes" as ONE
// kernel job of N steps, priced on a receipt before it runs:
//
//   take:<n>   one square picture of the request's prompt through the imaging router at 1:1, on the provider the
//              operator chose (Codex on the operator's seat, $0; or Leonardo Flare, per image), its bytes a blob,
//              its pixels MEASURED off the bytes (./pixels.ts) - never the provider's claim.
//
// The job writes no release. Each take is offered back to the sleeve step as a candidate (the job's outputs, read by
// lib/producers/releaseSleeve.ts `sleeveTakesOf`), and the pick is the operator's `sleeve` edit. A take the provider
// refused is booked as a miss with its sentence, so the other takes still land (the still producer's rule).
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS. The launch writes the request (the prompt, the provider, N and one take's
// estimate) as an event beside the enqueue, in one transaction; the drive reads it, never the page.

export const RELEASE_SLEEVE = "release-sleeve";
/** The event that carries a sleeve job's request (subject: the job). */
export const SLEEVE_REQUEST = "release-sleeve.requested";

export const takeStep = (n: number): string => `take:${n}`;

/** The take a step draws, or null for a step this producer does not have. */
export function takeOf(step: string, req: SleeveRequest): number | null {
  const m = /^take:([1-9]\d?)$/.exec(step);
  const n = m === null ? NaN : Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= req.takes ? n : null;
}

/** What is still missing: every take the job has not booked, in order. Pure. */
export function sleevePlan(req: SleeveRequest, outputs: Outputs): MissingStep[] {
  return Array.from({ length: req.takes }, (_, i) => ({ name: takeStep(i + 1), estimate: req.estimates.take })).filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/releaseSleeve.ts. */
export type SleevePorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<SleeveRequest>;
  readonly draw: (req: SleeveRequest, n: number, ctx: StepContext) => Promise<StepOutcome>;
};

/** The producer: one request read per job and kept (the sheet producer's shape). */
export function defineReleaseSleeve(lane: ResourceLane, ports: SleevePorts): Producer {
  const known = new Map<string, Result<SleeveRequest>>();
  const requestOf = (job: Job): Result<SleeveRequest> => {
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
      return sleevePlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const n = takeOf(step.name, req.value);
      if (n === null) return { kind: "fatal", code: "internal", message: `a sleeve job has no step ${step.name}` };
      try {
        return await ports.draw(req.value, n, ctx);
      } catch (e) {
        if (e instanceof AppError) return { kind: "fatal", code: e.code, message: e.message };
        throw e;
      }
    },
  };
}
