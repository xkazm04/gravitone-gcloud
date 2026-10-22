// WHAT EVERY MESH ACT SHARES (spark game-3d-assets WP2): the rules that say what a variant is
// asked for, and the one way its record is written.
//
// THE DECIMATE TARGET is round 4's (lynx-bench pof3d/ROUND4-BRIEF.md, mktrellis.mjs): a character's
// T1 is 38000 triangles - under the 40k class budget with room for the finish - and T2, the chunky
// game-camera design, 18000; anything else is its class budget (../types.ts BUDGETS, PoF's presets).
//
// THE WEAPON KIND is what the M1 touch-up (pipeline/mesh/blender/touchup.py) is driven by - a
// design length, slot names, whether a second blade is a defect - and the brief carries no field
// for it, so it is read from the subject's words. A subject that names none of the four kinds the
// script knows gets no touch-up, and says so.

import { readFileSync } from "node:fs";
import path from "node:path";

import { assetDir, mutateAsset, withVariant } from "./store";
import { BUDGETS, type AssetClass, type MeshAsset, type MeshVariant, type Technique } from "./types";

export function targetFaces(cls: AssetClass, technique: Technique): number {
  if (cls === "character") return technique === "T2" ? 18_000 : 38_000;
  return BUDGETS[cls].tris;
}

export const WEAPON_KINDS = ["sword", "mace", "axe", "staff"] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

/** The touch-up's kind from the brief's words, or undefined. "greataxe" and "battle-axe" read as axe. */
export function weaponKind(subject: string): WeaponKind | undefined {
  const words = subject.toLowerCase();
  return WEAPON_KINDS.find((k) => new RegExp(`(^|[^a-z])(great|battle|war)?-?${k}s?([^a-z]|$)`).test(words));
}

/** The name the Blender scripts give the mesh object (`SM_<name>`) and every file they write. */
export const meshName = (assetId: string, variantId: string): string => `${assetId}_${variantId}`.replace(/[^A-Za-z0-9_]/g, "_");

/** asset.json read synchronously - a job's plan is read inside its store transaction. Null: no such asset. */
export function readAssetNow(id: string): MeshAsset | null {
  try {
    return JSON.parse(readFileSync(path.join(assetDir(id), "asset.json"), "utf8")) as MeshAsset;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/**
 * One variant's write: `fn` over the variant as it is NOW, the job named on it once. A variant
 * that has vanished from the manifest writes nothing.
 */
export async function writeVariant(assetId: string, variantId: string, jobId: string | undefined, fn: (v: MeshVariant) => MeshVariant): Promise<MeshVariant | undefined> {
  let wrote: MeshVariant | undefined;
  await mutateAsset(assetId, (a) => {
    const v = a.variants.find((x) => x.id === variantId);
    if (v === undefined) return a;
    const next = fn(v);
    wrote = jobId === undefined || next.jobs.includes(jobId) ? next : { ...next, jobs: [...next.jobs, jobId] };
    return withVariant(a, wrote);
  });
  return wrote;
}

/** A variant failed with a sentence, verbatim; what it already made stays on it. */
export const failedWith = (v: MeshVariant, error: string): MeshVariant => ({ ...v, status: "failed", error });

/** The approach sentence a variant carries, by technique (the round's `approach`). */
export function approachOf(cls: AssetClass, technique: Technique, faces: number): string {
  switch (technique) {
    case "T1":
      return `TRELLIS.2 budget generation: ComfyUI remeshes and decimates to ${faces} triangles before the texture bake; Blender removes floaters under 1% of faces, ${cls === "character" ? "scales to 1.8 m, " : ""}and clamps metallic to 0.5`;
    case "T2":
      return `game-camera design: TRELLIS.2 at a ${faces}-triangle budget for a chunky silhouette read at 640x480; the same Blender finish as T1`;
    case "M1":
      return "automated touch-up of the T1 mesh (touchup.py): weld, floaters and stray shells removed, a mirrored second blade or an over-thick shaft corrected by rule, small holes filled, palette regraded toward the concept, sockets re-authored";
    case "M2":
      return "corrected regeneration: a corrected concept through the T1 pipeline, then the M1 touch-up";
  }
}
