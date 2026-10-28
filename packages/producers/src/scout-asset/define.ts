import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

import { studioCredit } from "../scout-ideas/define.ts";

// A NIGHT'S GAME ASSET, BRIEFED (spark game-3d-assets WP4) - one /scout `asset3d` candidate's
// cloud half as the steps of ONE kernel job, priced on a receipt before it runs:
//
//   concept:1..N  one still per concept, drawn from OUR words (the brief), no reference image:
//                 the class's canonical view - a character's orthographic front A-pose, a
//                 weapon's strict side profile, a prop's front - and, for a character's T2, a
//                 second design written for the game camera (round 4: strong silhouette, flat
//                 colour blocks, no thin parts)
//   handoff       free: each concept through the image-to-3D input gate, the mesh asset written
//                 with a variant per technique (a variant whose concept failed the gate is
//                 written failed with the gate's codes, and no GPU minute is spent on it), and
//                 the mesh job ENQUEUED - never driven here. The worker admits it on gpu.local
//                 by the comfy engine's profile, and its settle queues the Blender finish, so a
//                 night's discovery is never held behind a TRELLIS run.
//
// WHY THE HAND-OFF IS A STEP AND NOT THE SETTLE. A step is booked once: a drive that dies after
// the asset is written and before the mesh job is queued is re-planned with `handoff` missing,
// and the hand-off is idempotent (an asset that exists is read, a mesh job that is open is that
// job). A settle that died half way would be run by nobody.
//
// The pause holds what the resume needs (the scene producer's rule): the launch records the
// request - the concept prompts it priced and one still's estimate - as an event beside the
// enqueue, in one transaction.

export const SCOUT_ASSET = "scout-asset";
/** The event that carries an asset job's request (subject: the job). */
export const ASSET_REQUEST = "scout.asset-requested";

export const conceptStep = (k: number): string => `concept:${k}`;
export const HANDOFF_STEP = "handoff";

/** Which design a concept is: the class's canonical view, or a character's game-camera design (T2). */
export const CONCEPT_DESIGNS = ["canonical", "game-camera"] as const;
export type ConceptDesign = (typeof CONCEPT_DESIGNS)[number];

/** The hand-off writes files and queues a job; it calls no vendor. */
const HANDOFF_ESTIMATE = { seconds: 10, usd: 0 } as const;

const id = z.string().min(1).max(200);

export const assetRequestSchema = z
  .object({
    nightId: id,
    candidateId: id,
    /** The concepts the receipt priced, in step order: the canonical one first. */
    concepts: z
      .array(z.object({ design: z.enum(CONCEPT_DESIGNS), prompt: z.string().min(1).max(4000), aspect: z.enum(["9:16", "1:1"]) }).strict())
      .min(1)
      .max(2),
    /** The techniques the hand-off makes a variant for (lib/foundry/mesh/types.ts TECHNIQUES), checked at the launch. */
    techniques: z.array(z.enum(["T1", "T2", "M1", "M2"])).min(1).max(4),
    /** One still's estimate: what the job's ceiling is checked against before each concept. */
    estimates: z.object({ concept: estimateSchema }).strict(),
    by: id,
  })
  .strict();
export type AssetRequest = Parsed<z.output<typeof assetRequestSchema>>;

export const parseAssetRequest = (raw: unknown): Result<AssetRequest> => parseAt("asset request", assetRequestSchema, raw);

/** What is still missing, in order. Pure: the request and what the job has booked. */
export function assetPlan(req: AssetRequest, outputs: Outputs): MissingStep[] {
  // A studio concept is paid in studio credits (spark scout-vision S6): admitted under the job's USD ceiling, booked unpriced.
  const concept = { estimate: req.estimates.concept, ...studioCredit(req.estimates.concept) };
  const steps: MissingStep[] = [...req.concepts.map((_, i) => ({ name: conceptStep(i + 1), ...concept })), { name: HANDOFF_STEP, estimate: HANDOFF_ESTIMATE }];
  return steps.filter((s) => !outputs.has(s.name));
}

/** The world, bound by lib/producers/scoutAsset.ts. */
export type AssetPorts = {
  /** The job's request (its event), read outside the drive's transactions. */
  readonly request: (job: Job) => Result<AssetRequest>;
  readonly concept: (req: AssetRequest, k: number, ctx: StepContext) => Promise<StepOutcome>;
  readonly handoff: (req: AssetRequest, ctx: StepContext) => Promise<StepOutcome>;
  /** The candidate told the job's ending: a failure's sentence verbatim. */
  readonly ended: (req: AssetRequest, job: Job, ending: Ending) => Promise<void>;
};

/** The producer: the scene producer's shape, one request read per job and kept. */
export function defineScoutAsset(lane: ResourceLane, ports: AssetPorts): Producer {
  const known = new Map<string, Result<AssetRequest>>();
  const requestOf = (job: Job): Result<AssetRequest> => {
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
      if (req === undefined) throw new AppError("internal", `asset job ${job.id} was planned before its request was read`);
      if (!req.ok) throw req.error;
      return assetPlan(req.value, outputs);
    },
    async perform(step, ctx) {
      const req = requestOf(ctx.job);
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      if (step.name === HANDOFF_STEP) return ports.handoff(req.value, ctx);
      const k = step.name.startsWith("concept:") ? Number(step.name.slice("concept:".length)) : NaN;
      if (Number.isInteger(k) && k >= 1 && k <= req.value.concepts.length) return ports.concept(req.value, k, ctx);
      return { kind: "fatal", code: "internal", message: `an asset job has no step ${step.name}` };
    },
    async settle(job, ending) {
      const req = requestOf(job);
      if (!req.ok) throw req.error;
      await ports.ended(req.value, job, ending);
    },
  };
}
