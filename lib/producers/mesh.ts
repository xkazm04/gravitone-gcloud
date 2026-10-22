import path from "node:path";

import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job, RunMode } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Ending, Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";
import { defineMeshStage, FINISH, MESH, meshRunId, STAGE_INPUT, STAGE_LANE, type MeshStage, type MeshTarget, type StagePorts, type UnitIo } from "@gt/producers/mesh/define";

import { comfyHealth } from "../foundry/mesh/comfy.ts";
import { generateVariant, liveGenerateEngines, type GenerateEngines } from "../foundry/mesh/generate.ts";
import { failedWith, readAssetNow, writeVariant } from "../foundry/mesh/variant.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { kernel } from "../kernelProcess.ts";

// THE MESH PRODUCER, BOUND TO THIS BOX (spark game-3d-assets WP2): the definition
// (packages/producers/src/mesh/define.ts) over the asset store (lib/foundry/mesh/store.ts) and the
// TRELLIS act (lib/foundry/mesh/generate.ts). Its sibling, the finish stage, is ./finish.ts; the
// launch, the drive and the settle both stages share are here. The registry lines are
//
//   { name: "mesh", producer: meshProducer() },
//   { name: "finish", producer: finishProducer() },
//
// LAUNCHED AS SCOUT-INGEST IS (./scoutIngest.ts): a free local job enqueued directly - no receipt,
// no Run row, no ceiling. The job's id names the stage's run, `job:run:<stage>:<asset>[:<variant>]`,
// `~2`, `~3` for a later launch; it carries the launch's mode (dry by default, live only armed).
//
// THE MESH JOB'S SETTLE ENQUEUES THE FINISH JOB. When a mesh job ends with a generated variant and
// no finish job of the asset is open, the finish job is enqueued in the mesh job's own mode - so a
// worker that drove the mesh job (gpu.local, admitted as comfy) leaves the finish waiting on
// box.blender, admitted as blender, with nobody's hand between them. A failed or stopped job
// writes its sentence onto every variant still waiting for it, so asset.json never says `pending`
// about work no job will do.

const OPEN: readonly Job["state"][] = ["planned", "queued", "running", "paused", "interrupted"];

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The stage's jobs for a target in launch order: `job:run:<run>`, then `~2`, `~3`... */
export function stageJobs(store: Store, stage: MeshStage, t: MeshTarget): Job[] {
  const base = `job:run:${meshRunId(stage, t)}`;
  const out: Job[] = [];
  for (let k = 1; k < 1000; k++) {
    const j = jobOf(store, k === 1 ? base : `${base}~${k}`);
    if (j === undefined) return out;
    out.push(j);
  }
  throw new AppError("conflict", `${meshRunId(stage, t)} has been launched a thousand times`);
}

export type StageLaunch =
  | { readonly kind: "launched"; readonly jobId: string; readonly variants: readonly string[] }
  /** A job of this stage for the asset is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] }
  /** No variant in scope is in the stage's input status. */
  | { readonly kind: "nothing" };

/** Enqueue a stage's job for an asset (or one variant), in `mode`. */
export function launchStage(store: Store, stage: MeshStage, t: MeshTarget, o: { readonly mode: RunMode; readonly actor: Actor }): Result<StageLaunch> {
  let asset;
  try {
    asset = readAssetNow(t.assetId);
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 400 ? "invalid" : "unavailable", e.message);
    throw e;
  }
  if (asset === null) return err("not-found", `no asset called ${t.assetId}`);
  if (t.variantId !== undefined && !asset.variants.some((v) => v.id === t.variantId)) return err("not-found", `asset ${t.assetId} has no variant ${t.variantId}`);
  const open = [...stageJobs(store, stage, { assetId: t.assetId }), ...(t.variantId === undefined ? [] : stageJobs(store, stage, t))].find((j) => OPEN.includes(j.state));
  if (open !== undefined) return ok({ kind: "existing", jobId: open.id, state: open.state });
  const variants = asset.variants.filter((v) => v.status === STAGE_INPUT[stage] && (t.variantId === undefined || v.id === t.variantId)).map((v) => v.id);
  if (variants.length === 0) return ok({ kind: "nothing" });
  const prior = stageJobs(store, stage, t);
  const base = `job:run:${meshRunId(stage, t)}`;
  const jobId = prior.length === 0 ? base : `${base}~${prior.length + 1}`;
  const r = store.tx((tx) => enqueueIn(tx, { id: jobId, of: { kind: "run", id: meshRunId(stage, t) }, producer: stage, lane: STAGE_LANE[stage], mode: o.mode }, o.actor));
  if (!r.ok) return r;
  return ok({ kind: "launched", jobId, variants });
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

const MACHINE: Actor = { kind: "machine", id: "mesh" };

/** After a stage's job ends: waiting variants told, and a finished mesh job hands on to finish. */
export async function stageEnded(store: () => Result<Store>, stage: MeshStage, t: MeshTarget, job: Job, ending: Ending): Promise<void> {
  const asset = readAssetNow(t.assetId);
  if (asset === null) return;
  if (ending === "failed" || ending === "stopped") {
    const said = job.error?.message ?? `the ${stage} job ${job.id} ${ending}`;
    for (const v of asset.variants.filter((x) => x.status === STAGE_INPUT[stage] && (t.variantId === undefined || x.id === t.variantId))) {
      await writeVariant(t.assetId, v.id, job.id, (x) => (x.status === STAGE_INPUT[stage] ? failedWith(x, said) : x));
    }
  }
  if (stage !== MESH || ending !== "done") return;
  const s = store();
  if (!s.ok) throw s.error;
  const r = launchStage(s.value, FINISH, { assetId: t.assetId }, { mode: job.mode, actor: MACHINE });
  if (!r.ok) throw r.error;
}

export type StageDeps = { readonly store?: () => Result<Store> };

/** The ports of a stage over this box; `unit` is the stage's act. */
export function stagePorts(stage: MeshStage, unit: StagePorts["unit"], engineHealth: StagePorts["engineHealth"], deps: StageDeps = {}): StagePorts {
  const store = deps.store ?? processStore;
  return {
    load(assetId) {
      try {
        const a = readAssetNow(assetId);
        return a === null ? err("not-found", `no asset called ${assetId}`) : ok({ id: a.id, variants: a.variants.map((v) => ({ id: v.id, status: v.status })) });
      } catch (e) {
        return err("unavailable", `asset ${assetId} is unreadable: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    unit,
    engineHealth,
    ended: (st, t, job, ending) => stageEnded(store, st, t, job, ending),
  };
}

/** The bound mesh producer; a test hands it fake ComfyUI engines and its own store. */
export function meshProducer(o: StageDeps & { readonly engines?: () => GenerateEngines } = {}): Producer {
  const engines = o.engines ?? liveGenerateEngines;
  const unit = (assetId: string, variantId: string, io: UnitIo) => generateVariant(assetId, variantId, io, engines());
  return defineMeshStage(MESH, stagePorts(MESH, unit, () => comfyHealth(engines().comfyUrl, engines().comfy), o));
}

/** Drive one stage job in this process (the CLI's default; the worker's otherwise). */
export function driveStage(store: Store, location: string, jobId: string, producer: Producer, opts: RunOptions = {}): Promise<Result<RunReport>> {
  // Its own effects, as the profile job's: extract's `effectsFor` pulls v1 engines a plain CLI never loads.
  const fx = liveEffects(store, blobStore(location === ":memory:" ? path.resolve("foundry-out", "blobs") : path.join(path.dirname(location), "blobs")));
  return runJob(fx, producer, jobId, opts);
}
