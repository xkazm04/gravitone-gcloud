// WHAT pipeline/mesh.mts DOES, AS FUNCTIONS (spark game-3d-assets WP2) - so a test drives exactly
// the operator's path over a temp store, and the CLI file is only arguments and printing.
//
//   newAsset     the concept's input gate -> createAsset -> the mesh job -> the finish job, driven
//                here unless detached. A gate that fails (or could not read the concept) refuses
//                BEFORE anything is written or queued: no asset, no job, no GPU minute
//   retryFinish  failed variants that have a raw mesh go back to `generated`, and a finish job runs
//   decide       keep or reject a variant - the stand-in for /scout's packet, which will own this act
//
// DRY BY DEFAULT. A live launch is armed here (@gt/kernel/dryrun `armLive`) and refused under
// GRAVITONE_DRY_ONLY=1. A live mesh job driven in this process first asks ComfyUI's /queue: the
// worker's admission waits for an empty queue (docs/resources.md), and so does this path - a busy
// ComfyUI leaves the job queued for the worker rather than stacking a second heavy prompt on it.

import { copyFile } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { RunMode } from "@gt/domain/job";
import { armLive, DRY } from "@gt/kernel/dryrun";
import type { RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";
import { FINISH, MESH } from "@gt/producers/mesh/define";

import { driveStage, launchStage, meshProducer, stageJobs, type StageDeps } from "../../producers/mesh.ts";
import { finishProducer } from "../../producers/finish.ts";
import { comfyQueued } from "./comfy";
import type { FinishEngines } from "./finish";
import type { GenerateEngines } from "./generate";
import { admitsMesh, inputGate, type Decode } from "./inputGate";
import { createAsset, mutateAsset, readAsset, resolveInAsset, withVariant } from "./store";
import { ASSET_ID_RE, BUDGETS, type AssetClass, type GateResult, type MeshAsset, type Technique } from "./types";

export const DEFAULT_TECHNIQUES: { readonly [C in AssetClass]: readonly Technique[] } = {
  character: ["T1", "T2"],
  weapon: ["T1", "M1"],
  prop: ["T1"],
};

export type NewAsk = {
  readonly id: string;
  readonly cls: AssetClass;
  readonly subject: string;
  readonly concept: string;
  readonly techniques?: readonly Technique[];
  readonly rig?: boolean;
  readonly live?: boolean;
  readonly detach?: boolean;
  readonly actor: Actor;
  readonly dryOnly: boolean;
};

export type Engines = {
  readonly decode?: Decode;
  readonly generate?: () => GenerateEngines;
  readonly finish?: () => FinishEngines;
  /** ComfyUI's queue length for a live in-process drive; absent: asked over HTTP. */
  readonly comfyQueue?: () => Promise<number | undefined>;
} & StageDeps;

export type Drove = { readonly jobId: string; readonly outcome: RunReport["outcome"] | "queued"; readonly reason?: string };

export type NewOutcome =
  | { readonly kind: "refused"; readonly gate: GateResult }
  | { readonly kind: "made"; readonly asset: MeshAsset; readonly gate: GateResult; readonly drove: readonly Drove[] };

/** Why a technique list cannot be made for a class, or the list. */
export function techniquesFor(cls: AssetClass, asked: readonly Technique[] | undefined, rig: boolean): Result<readonly Technique[]> {
  const list = asked ?? DEFAULT_TECHNIQUES[cls];
  if (list.length === 0) return err("invalid", "name at least one technique");
  if (new Set(list).size !== list.length) return err("invalid", `a technique is named twice: ${list.join(",")}`);
  if (list.includes("M2")) return err("invalid", "M2 (corrected regeneration) needs a corrected concept of its own; make it as a new asset whose concept is the corrected one");
  if (list.includes("M1") && (cls !== "weapon" || !list.includes("T1"))) return err("invalid", "M1 touches up a weapon's T1 mesh: it needs --class weapon and T1 beside it");
  if (rig && cls !== "character") return err("invalid", "--rig fits UE5 Mannequin chains to a character; a weapon or a prop is not rigged");
  // T1 first, so the M1 unit finds T1's mesh made (a job runs its units in manifest order).
  return ok([...list].sort((a, b) => (a === "T1" ? -1 : b === "T1" ? 1 : 0)));
}

async function modeOf(live: boolean | undefined, actor: Actor, reason: string, dryOnly: boolean): Promise<Result<RunMode>> {
  return live === true ? armLive(actor, new Date().toISOString(), reason, { dryOnly }) : ok(DRY);
}

/** Drive one stage's open job here; a live mesh job on a busy ComfyUI stays queued for the worker. */
async function driveOpen(store: Store, location: string, stage: typeof MESH | typeof FINISH, assetId: string, e: Engines, dryOnly: boolean): Promise<Drove | undefined> {
  const job = stageJobs(store, stage, { assetId }).find((j) => j.state === "queued");
  if (job === undefined) return undefined;
  if (stage === MESH && job.mode.kind === "live") {
    const q = await (e.comfyQueue ?? (() => comfyQueued()))();
    if (q === undefined || q > 0) return { jobId: job.id, outcome: "queued", reason: q === undefined ? "ComfyUI does not answer /queue" : `ComfyUI has ${q} prompt(s) queued; the worker admits this job when it is empty` };
  }
  // The settle that queues the finish job writes through the store this drive holds, not a second handle.
  const deps = { store: e.store ?? (() => ok(store)) };
  const producer = stage === MESH ? meshProducer({ ...deps, ...(e.generate === undefined ? {} : { engines: e.generate }) }) : finishProducer({ ...deps, ...(e.finish === undefined ? {} : { engines: e.finish }) });
  const r = await driveStage(store, location, job.id, producer, { dryOnly });
  if (!r.ok) return { jobId: job.id, outcome: "failed", reason: r.error.message };
  return { jobId: job.id, outcome: r.value.outcome, ...(r.value.job?.error === undefined ? {} : { reason: r.value.job.error.message }) };
}

export async function newAsset(store: Store, location: string, ask: NewAsk, e: Engines = {}): Promise<Result<NewOutcome>> {
  if (!ASSET_ID_RE.test(ask.id)) return err("invalid", `"${ask.id}" is not an asset id (lowercase letters, digits and dashes, 2-61 characters)`);
  if (ask.subject.trim() === "") return err("invalid", "--subject names what the asset is");
  const techniques = techniquesFor(ask.cls, ask.techniques, ask.rig === true);
  if (!techniques.ok) return techniques;
  const gate = await inputGate(ask.concept, e.decode);
  if (!admitsMesh(gate)) return ok({ kind: "refused", gate });
  const mode = await modeOf(ask.live, ask.actor, `mesh new ${ask.id} --live`, ask.dryOnly);
  if (!mode.ok) return mode;
  const concept = `concept${path.extname(ask.concept).toLowerCase() || ".png"}`;
  await createAsset({
    id: ask.id,
    createdAt: new Date().toISOString(),
    brief: { class: ask.cls, subject: ask.subject.trim(), budgetTris: BUDGETS[ask.cls].tris, ...(ask.rig === true ? { rig: "ue5-mannequin" as const } : {}) },
    concept,
    variants: techniques.value.map((t) => ({ id: t.toLowerCase(), technique: t, status: "pending" as const, limitations: [], files: {}, gates: [gate], jobs: [] })),
    dry: mode.value.kind === "dry",
    rights: "publishable",
  });
  await copyFile(ask.concept, resolveInAsset(ask.id, concept));
  const launched = launchStage(store, MESH, { assetId: ask.id }, { mode: mode.value, actor: ask.actor });
  if (!launched.ok) return launched;
  const drove: Drove[] = [];
  if (ask.detach !== true) {
    const m = await driveOpen(store, location, MESH, ask.id, e, ask.dryOnly);
    if (m !== undefined) drove.push(m);
    // The mesh job's settle enqueued the finish job; it is driven here as the worker would.
    if (m?.outcome === "done") {
      const f = await driveOpen(store, location, FINISH, ask.id, e, ask.dryOnly);
      if (f !== undefined) drove.push(f);
    }
  }
  return ok({ kind: "made", asset: await readAsset(ask.id), gate, drove });
}

/** Failed variants with a raw mesh back to `generated`, and a finish job for them (or one variant). */
export async function retryFinish(store: Store, location: string, a: { readonly assetId: string; readonly variantId?: string; readonly live?: boolean; readonly detach?: boolean; readonly actor: Actor; readonly dryOnly: boolean }, e: Engines = {}): Promise<Result<{ readonly asset: MeshAsset; readonly drove: readonly Drove[]; readonly reset: readonly string[] }>> {
  const mode = await modeOf(a.live, a.actor, `mesh finish ${a.assetId} --live`, a.dryOnly);
  if (!mode.ok) return mode;
  const reset: string[] = [];
  await mutateAsset(a.assetId, (x) => {
    let next = x;
    for (const v of x.variants) {
      if (v.status !== "failed" || v.files.raw === undefined || (a.variantId !== undefined && v.id !== a.variantId)) continue;
      const { error: _e, ...rest } = v;
      next = withVariant(next, { ...rest, status: "generated" });
      reset.push(v.id);
    }
    return next;
  });
  const launched = launchStage(store, FINISH, { assetId: a.assetId, ...(a.variantId === undefined ? {} : { variantId: a.variantId }) }, { mode: mode.value, actor: a.actor });
  if (!launched.ok) return launched;
  if (launched.value.kind === "nothing") return err("refused", `asset ${a.assetId} has no ${a.variantId ?? "variant"} with a raw mesh waiting for a finish`);
  const drove: Drove[] = [];
  if (a.detach !== true && launched.value.kind === "launched") {
    const id = launched.value.jobId;
    const job = stageJobs(store, FINISH, { assetId: a.assetId, ...(a.variantId === undefined ? {} : { variantId: a.variantId }) }).find((j) => j.id === id);
    if (job !== undefined) {
      const deps = { store: e.store ?? (() => ok(store)), ...(e.finish === undefined ? {} : { engines: e.finish }) };
      const r = await driveStage(store, location, job.id, finishProducer(deps), { dryOnly: a.dryOnly });
      drove.push(r.ok ? { jobId: job.id, outcome: r.value.outcome } : { jobId: job.id, outcome: "failed", reason: r.error.message });
    }
  }
  return ok({ asset: await readAsset(a.assetId), drove, reset });
}

/** Keep or reject a variant. Only a finished variant can be kept; anything can be rejected. */
export async function decide(assetId: string, variantId: string, verdict: "kept" | "rejected"): Promise<Result<MeshAsset>> {
  let refusal: string | undefined;
  const a = await mutateAsset(assetId, (x) => {
    const v = x.variants.find((y) => y.id === variantId);
    if (v === undefined) {
      refusal = `asset ${assetId} has no variant ${variantId}`;
      return x;
    }
    if (verdict === "kept" && v.status !== "finished") {
      refusal = `${variantId} is ${v.status}; only a finished variant can be kept`;
      return x;
    }
    return withVariant(x, { ...v, verdict });
  });
  return refusal === undefined ? ok(a) : err("refused", refusal);
}
