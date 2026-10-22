// THE MESH UNIT (spark game-3d-assets WP2) - one variant `pending` -> `generated`: TRELLIS.2 through
// ComfyUI (./comfy.ts) writes `<variant>/raw.glb`; a dry job writes a stand-in (./standin.ts) and
// calls nothing. An M1 touch-up variant generates nothing of its own: it is the T1 mesh, touched up
// in the finish stage, so its unit copies T1's raw.glb (no second GPU run for the same draw).
//
// Outcomes, by whose they are (packages/producers/src/mesh/define.ts): ComfyUI not answering is
// `unreachable` (the job retries, then its breaker fails it); ComfyUI answering no - a refused
// prompt, a node error, a timeout - is the VARIANT's failure, its sentence verbatim, and the unit
// is done.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { UnitIo, UnitOutcome } from "@gt/producers/mesh/define";

import { FoundryError } from "../runStore";
import { comfyUrl, nodeComfyPorts, readWorkflow, runTrellis, type ComfyPorts, type Workflow } from "./comfy";
import { standInGlb } from "./standin";
import { readAsset, resolveInAsset } from "./store";
import type { MeshAsset, MeshVariant } from "./types";
import { approachOf, failedWith, targetFaces, writeVariant } from "./variant";

export type GenerateEngines = {
  readonly comfyUrl: string;
  readonly comfy: ComfyPorts;
  readonly workflow: () => Promise<Workflow>;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
};

export const liveGenerateEngines = (): GenerateEngines => ({ comfyUrl: comfyUrl(), comfy: nodeComfyPorts, workflow: () => readWorkflow() });

export const RAW = "raw.glb";

/** The asset, or the store's refusal as a Result (a missing or unreadable manifest is the job's end). */
export async function assetOf(id: string): Promise<Result<MeshAsset>> {
  try {
    return ok(await readAsset(id));
  } catch (e) {
    if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 400 ? "invalid" : "unavailable", e.message);
    throw e;
  }
}

export async function generateVariant(assetId: string, variantId: string, io: UnitIo, e: GenerateEngines): Promise<Result<UnitOutcome>> {
  const a = await assetOf(assetId);
  if (!a.ok) return a;
  const asset = a.value;
  const v = asset.variants.find((x) => x.id === variantId);
  if (v === undefined) return err("not-found", `asset ${assetId} has no variant ${variantId}`);
  if (v.status !== "pending") return ok({ kind: "done", status: v.status });
  const rel = `${v.id}/${RAW}`;
  const abs = resolveInAsset(assetId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const faces = targetFaces(asset.brief.class, v.technique);
  const generated = (x: MeshVariant): MeshVariant => {
    const { error: _e, ...rest } = x;
    return { ...rest, status: "generated", files: { ...x.files, raw: rel }, approach: approachOf(asset.brief.class, x.technique, faces) };
  };
  const finish = async (fn: (x: MeshVariant) => MeshVariant, status: MeshVariant["status"], extra: { error?: string; seconds?: number } = {}): Promise<Result<UnitOutcome>> => {
    io.stillHeld();
    await writeVariant(assetId, variantId, io.jobId, fn);
    return ok({ kind: "done", status, ...extra });
  };

  if (v.technique === "M1") {
    const t1 = asset.variants.find((x) => x.technique === "T1");
    const src = t1?.files.raw;
    if (t1 === undefined || src === undefined || t1.status === "failed" || t1.status === "pending") {
      const why = `M1 touches up the T1 mesh, and T1 has none (${t1 === undefined ? "no T1 variant" : `T1 is ${t1.status}`})`;
      return finish((x) => failedWith(x, why), "failed", { error: why });
    }
    await copyFile(resolveInAsset(assetId, src), abs);
    return finish((x) => generated({ ...x, ...(t1.seed === undefined ? {} : { seed: t1.seed }) }), "generated");
  }

  if (io.dry) {
    await writeFile(abs, standInGlb(asset.brief.class, { name: `raw_${variantId}` }));
    return finish((x) => generated(x), "generated");
  }

  if (asset.concept === undefined) {
    const why = "the asset has no concept image to generate from";
    return finish((x) => failedWith(x, why), "failed", { error: why });
  }
  const concept = new Uint8Array(await readFile(resolveInAsset(assetId, asset.concept)));
  const run = await runTrellis(
    e.comfyUrl,
    await e.workflow(),
    { concept, conceptName: `gravitone_${assetId}${path.extname(asset.concept) || ".png"}`, targetFaces: faces, prefix: `gravitone/${assetId}_${variantId}`, ...(v.seed === undefined ? {} : { seed: v.seed }) },
    e.comfy,
    { ...(e.timeoutMs === undefined ? {} : { timeoutMs: e.timeoutMs }), ...(e.pollMs === undefined ? {} : { pollMs: e.pollMs }) },
  );
  if (!run.ok && run.kind === "unreachable") return ok({ kind: "unreachable", message: run.message });
  if (!run.ok) {
    const why = run.message;
    return finish((x) => failedWith(x, why), "failed", { error: why });
  }
  io.stillHeld();
  await writeFile(abs, run.glb);
  return finish((x) => generated(x), "generated", { seconds: run.seconds });
}
