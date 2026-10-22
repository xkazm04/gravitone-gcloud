import { AppError, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { vendorHealth, type Ending, type Health, type MissingStep, type Producer, type StepContext } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";

// A GAME ASSET'S MESH AS TWO JOBS (spark game-3d-assets WP2) - the variants of one asset
// (lib/foundry/mesh asset.json: T1 budget generation, T2 game-camera design, a weapon's M1 touch-up)
// made in two stages, each a kernel job with one unit per variant:
//
//   mesh    lane gpu.local, engine comfy    TRELLIS.2 through ComfyUI: concept -> <variant>/raw.glb,
//                                           the variant `pending` -> `generated`
//   finish  lane box.blender, engine blender the ported lynx-bench Blender scripts: finish (or the
//                                           M1 touch-up), rig, metrics, renders, the export read
//                                           back, the ported PoF gates -> `finished`
//
// TWO JOBS, BECAUSE TWO ENGINES. Admission charges a job its engine's measured profile
// (@gt/domain/resource `admit`): a ComfyUI render holds the card and a Blender bake holds the CPU
// and commit charge, and one job naming both could be admitted by neither profile honestly. So the
// mesh job ends, its settle enqueues the finish job, and the worker admits each by its own engine.
//
// FREE AND LOCAL, AS SCOUT-INGEST IS (../scout-ingest/define.ts): every unit is estimated at $0 and
// reports `costUsd: 0`; there is no receipt and no ceiling, because no vendor bills a local engine.
// The job's MODE still matters: a dry job is answered by stand-ins (a generated glb, no ComfyUI, no
// Blender), a live one runs the engines - and `health` asks ComfyUI or Blender only for a live job.
//
// A VARIANT THAT FAILS IS A FACT, NOT A JOB FAILURE. TRELLIS refusing a concept, a Blender script
// exiting non-zero, a timeout - each is written onto the variant (`failed`, the engine's sentence
// verbatim) and the unit is PRODUCED. Only an engine that does not answer at all is a
// vendor-failure (the breaker's business), and only an asset that cannot be read or written is
// fatal. THE PLAN IS THE MANIFEST, as ingest's is: a unit for every variant in the job's scope that
// is still in the stage's input status and not already booked.

export const MESH = "mesh";
export const FINISH = "finish";
export type MeshStage = typeof MESH | typeof FINISH;

export const STAGE_LANE: { readonly [S in MeshStage]: ResourceLane } = { mesh: "gpu.local", finish: "box.blender" };
export const STAGE_ENGINE: { readonly [S in MeshStage]: string } = { mesh: "comfy", finish: "blender" };
/** The status a variant must hold for the stage to take it. */
export const STAGE_INPUT: { readonly [S in MeshStage]: VariantStatus } = { mesh: "pending", finish: "generated" };
/** TRELLIS took 170-405 s per run on this box (lynx-bench rounds 2-4); a finish chain, a few minutes. */
const ESTIMATE: { readonly [S in MeshStage]: Estimate } = { mesh: { seconds: 300, usd: 0 }, finish: { seconds: 240, usd: 0 } };

export type VariantStatus = "pending" | "generated" | "finished" | "failed";
export type AssetView = { readonly id: string; readonly variants: readonly { readonly id: string; readonly status: VariantStatus }[] };

/** An asset, or one variant of it. */
export type MeshTarget = { readonly assetId: string; readonly variantId?: string };

/** The run a job serves: `<stage>:<asset>` or `<stage>:<asset>:<variant>`. */
export const meshRunId = (stage: MeshStage, t: MeshTarget): string => `${stage}:${t.assetId}${t.variantId === undefined ? "" : `:${t.variantId}`}`;

export function parseMeshRunId(id: string): { readonly stage: MeshStage; readonly target: MeshTarget } | null {
  const [stage, assetId, variantId, extra] = id.split(":");
  if ((stage !== MESH && stage !== FINISH) || assetId === undefined || assetId === "" || variantId === "" || extra !== undefined) return null;
  return { stage, target: variantId === undefined ? { assetId } : { assetId, variantId } };
}

const STEP = "variant:";
export const variantStep = (variantId: string): string => `${STEP}${variantId}`;

/** The units still to do: variants in scope, in the stage's input status, not booked by this job. */
export function planStage(stage: MeshStage, target: MeshTarget, asset: AssetView, booked: ReadonlySet<string>): MissingStep[] {
  return asset.variants
    .filter((v) => v.status === STAGE_INPUT[stage] && (target.variantId === undefined || v.id === target.variantId) && !booked.has(variantStep(v.id)))
    .map((v) => ({ name: variantStep(v.id), estimate: ESTIMATE[stage] }));
}

/** What one unit did to its variant. `unreachable`: the engine never answered - retried, then the breaker. */
export type UnitOutcome =
  | { readonly kind: "done"; readonly status: VariantStatus; readonly error?: string; readonly seconds?: number }
  | { readonly kind: "unreachable"; readonly message: string };

export type UnitIo = {
  readonly jobId: string;
  readonly dry: boolean;
  /** Throws when this drive no longer holds its slot: asked before every manifest write. */
  readonly stillHeld: () => void;
};

export type StagePorts = {
  /** asset.json, synchronously: the plan is read inside the job's store transaction. */
  load(assetId: string): Result<AssetView>;
  /** One variant through the stage, its outcome written onto it. Err only when the asset is unusable. */
  unit(assetId: string, variantId: string, io: UnitIo): Promise<Result<UnitOutcome>>;
  /** Is the engine there? Asked for a LIVE job only (a dry one runs no engine). */
  engineHealth(): Promise<Health>;
  /** Told the job's ending (kernel job-core `settle`): the manifest catches up with what the kernel decided. */
  ended(stage: MeshStage, target: MeshTarget, job: Job, ending: Ending): Promise<void>;
};

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function targetOf(stage: MeshStage, job: Job): MeshTarget {
  const p = parseMeshRunId(job.of.id);
  if (p === null || p.stage !== stage) throw new AppError("invalid", `job ${job.id} serves ${job.of.id}, which is not a ${stage} run`);
  return p.target;
}

function stillHeld(ctx: StepContext): () => void {
  return () => {
    const { slot, lease } = ctx.job;
    if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; asset.json is not written`);
    must(ctx.fx.tx("mesh.fence", (t) => assertFence(t, slot, lease.fence)));
  };
}

const fatal = (code: AppErrorCode, message: string) => ({ kind: "fatal" as const, code, message });

/** The producer of one stage. */
export function defineMeshStage(stage: MeshStage, ports: StagePorts): Producer {
  return {
    lane: STAGE_LANE[stage],
    engine: STAGE_ENGINE[stage],
    health: vendorHealth(() => ports.engineHealth()),
    plan(job, outputs) {
      const target = targetOf(stage, job);
      return planStage(stage, target, must(ports.load(target.assetId)), new Set(outputs.keys()));
    },
    async perform(step, ctx) {
      const target = targetOf(stage, ctx.job);
      if (!step.name.startsWith(STEP)) return fatal("internal", `${stage} planned ${step.name}, which is not a variant unit`);
      const variantId = step.name.slice(STEP.length);
      const r = await ports.unit(target.assetId, variantId, { jobId: ctx.job.id, dry: ctx.job.mode.kind === "dry", stillHeld: stillHeld(ctx) });
      if (!r.ok) return fatal(r.error.code, r.error.message);
      const o = r.value;
      if (o.kind === "unreachable") return { kind: "vendor-failure", message: o.message };
      const output = { variant: variantId, status: o.status, ...(o.error === undefined ? {} : { error: o.error }), ...(o.seconds === undefined ? {} : { seconds: o.seconds }) };
      return { kind: "produced", output, costUsd: 0 };
    },
    async settle(job, ending) {
      await ports.ended(stage, targetOf(stage, job), job, ending);
    },
  };
}
