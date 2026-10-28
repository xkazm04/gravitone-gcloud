import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

import { studioCredit } from "../scout-ideas/define.ts";

// A FOUND SCENE AS A JOB (spark media-training-loop WP2) - one /scout scene candidate's three acts
// as the steps of ONE kernel job, priced on a receipt before it runs:
//
//   read-scene       `read:1..N`    one recognize call per source keyframe, in time order; each is
//                                   handed the earlier answers as words, and the last answer, once
//                                   it passes the recipe door, is the scene's recipe (words only)
//   replicate-scene  `replica:1..R` one still per step from the recipe's prompt, no reference image
//   render-clip      `clip`         only when the launch asked for one: OUR first replica animated
//
// ONE JOB, ONE LANE, THE EXPENSIVE HALF'S (extract's rule: packages/producers/src/extract/define.ts
// "ONE LANE FOR A JOB THAT CALLS TWO KINDS OF VENDOR"). Since 2026-10-22 a scene's clip renders on
// this box (LTX-2.5 through ComfyUI, free), so a scene with a local clip waits on the card's gpu.local
// slot; one without waits on its stills' engine's lane (spark scout-vision S6: box.chrome for the
// Leonardo studio, the default; gpu.local for local Flux; cloud.leonardo for Flare); the reads route
// inside the step (lib/producers/scoutScene.ts `sceneLane`). cloud.google stays bound for a scene
// queued before that change. One job per scene keeps the night's
// arithmetic simple - one job id per candidate on `night.jobs`, one ceiling, one ending - and a
// clip never needs a second launch the first one's settle would have to make.
//
// THE PAUSE HOLDS WHAT THE RESUME NEEDS (the style producer's rule). The launch records the
// request - the keyframes it priced, the replica count, whether a clip was asked for, each act's
// estimate - as an event beside the enqueue, in one transaction; a worker that picks the job up
// after a restart renders exactly what was priced. Each step is booked once; a retry performs only
// what is missing, so a refused recipe never re-pays its reads and a failed clip never re-draws
// its stills.

export const SCOUT_SCENE = "scout-scene";
/** The event that carries a scene job's request (subject: the job). */
export const SCENE_REQUEST = "scout.scene-requested";

export const readStep = (k: number): string => `read:${k}`;
export const replicaStep = (k: number): string => `replica:${k}`;
export const CLIP_STEP = "clip";

/** The most keyframes a scene reads (lib/foundry/scout/scene.ts MAX_READ_FRAMES says why). */
const MAX_FRAMES = 5;

const id = z.string().min(1).max(200);

export const sceneRequestSchema = z
  .object({
    nightId: id,
    candidateId: id,
    /** The keyframes the receipt priced, night-relative, in time order. */
    keyframes: z.array(id).min(1).max(MAX_FRAMES),
    replicas: z.number().int().min(1).max(2),
    clip: z.boolean(),
    /** One call's estimate per act: what the job's ceiling is checked against before each step. */
    estimates: z.object({ read: estimateSchema, replica: estimateSchema, clip: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type SceneRequest = Parsed<z.output<typeof sceneRequestSchema>>;

export const parseSceneRequest = (raw: unknown): Result<SceneRequest> => parseAt("scene request", sceneRequestSchema, raw);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function scenePlan(req: SceneRequest, outputs: Outputs): MissingStep[] {
  const steps: MissingStep[] = [
    ...req.keyframes.map((_, i) => ({ name: readStep(i + 1), estimate: req.estimates.read })),
    // A studio still is paid in studio credits (spark scout-vision S6): admitted under the job's USD ceiling, booked unpriced.
    ...Array.from({ length: req.replicas }, (_, i) => ({ name: replicaStep(i + 1), estimate: req.estimates.replica, ...studioCredit(req.estimates.replica) })),
    ...(req.clip ? [{ name: CLIP_STEP, estimate: req.estimates.clip }] : []),
  ];
  return steps.filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutScene.ts: the request read, the three acts, the ending. */
export type ScenePorts = {
  /** The job's request (its event). Read OUTSIDE the drive's transactions, as the style producer's. */
  readonly request: (job: Job) => Result<SceneRequest>;
  readonly read: (req: SceneRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly replicate: (req: SceneRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly clip: (req: SceneRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidate told the job's ending: rendered, or failed with the job's sentence. */
  readonly ended: (req: SceneRequest, job: Job, ending: Ending) => Promise<void>;
};

const stepIndex = (name: string, prefix: string): number | null => {
  if (!name.startsWith(prefix)) return null;
  const k = Number(name.slice(prefix.length));
  return Number.isInteger(k) && k >= 1 ? k : null;
};

/**
 * The producer. A request never changes once its job exists, so it is read once per job and kept:
 * `health` - asked before every claim, outside any transaction - reads it, and `plan`, called
 * inside the claim's transaction, takes it from there (packages/producers/src/style/define.ts).
 */
export function defineScoutScene(lane: ResourceLane, ports: ScenePorts): Producer {
  const known = new Map<string, Result<SceneRequest>>();
  const requestOf = (job: Job): Result<SceneRequest> => {
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
      if (req === undefined) throw new AppError("internal", `scene job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return scenePlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const read = stepIndex(step.name, "read:");
      if (read !== null) return ports.read(req.value, read, ctx);
      const replica = stepIndex(step.name, "replica:");
      if (replica !== null) return ports.replicate(req.value, replica, ctx);
      if (step.name === CLIP_STEP) return ports.clip(req.value, ctx);
      return { kind: "fatal", code: "internal", message: `a scene job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
