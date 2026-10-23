// THE MESH ASSET STORE - server only. One directory per asset under foundry-out/mesh/<assetId>/
// (MESH_STORE_DIR redirects the root, read per call, so a test or a rehearsal never writes the
// checkout's):
//
//   asset.json            the manifest (./types.ts MeshAsset)
//   concept.png           the concept image the variants were made from
//   <variantId>/          raw.glb, <name>.glb (finished), rigged.glb, poster.png, renders, .blend
//
// Writers go through `mutateAsset` under the run lock (a lock FILE: the mesh and finish producers
// and the CLI write one manifest from different processes), as the scout night store does.

import { readdir, stat } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { outPath } from "../../fixtures/roots";
import { FoundryError, containedIn, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { ASSET_ID_RE, type AssetId, type MeshAsset, type MeshVariant } from "./types";

const ASSET_FILE = "asset.json";
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json", ".glb", ".mp4", ".webm"]);

/** MESH_STORE_DIR, else `<out>/mesh`. Read per call. */
export function meshRoot(): string {
  return process.env["MESH_STORE_DIR"]?.trim() || outPath("mesh");
}

export function assetDir(id: AssetId): string {
  if (!ASSET_ID_RE.test(id)) throw new FoundryError(`That is not an asset id: ${id}.`, 400);
  return path.join(meshRoot(), id);
}

/** An absolute path inside the asset, refused when `rel` climbs out of it. */
export function resolveInAsset(id: AssetId, rel: string): string {
  return containedIn(assetDir(id), rel, false, "asset");
}

/** Reserve the directory and write the first manifest; EEXIST is a 409, never an overwrite. */
export async function createAsset(a: MeshAsset): Promise<MeshAsset> {
  await mkdir(meshRoot(), { recursive: true });
  try {
    await mkdir(assetDir(a.id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new FoundryError(`An asset called ${a.id} already exists.`, 409);
    throw e;
  }
  await saveAsset(a);
  return a;
}

export async function readAsset(id: AssetId): Promise<MeshAsset> {
  const a = await readManifestFile<MeshAsset>(path.join(assetDir(id), ASSET_FILE), id, "asset");
  if (a === undefined) throw new FoundryError(`The manifest of asset ${id} is unreadable - a writer may be mid-write; try again.`, 503);
  if (!a) throw new FoundryError(`No asset called ${id}.`, 404);
  return a;
}

export const saveAsset = (a: MeshAsset): Promise<void> => writeJsonAtomic(path.join(assetDir(a.id), ASSET_FILE), a);

/** Read, change, write under the asset's lock file; returning the same object writes nothing. */
export async function mutateAsset(id: AssetId, fn: (a: MeshAsset) => MeshAsset): Promise<MeshAsset> {
  return withRunLock(assetDir(id), async () => {
    const before = await readAsset(id);
    const after = fn(before);
    if (after !== before) await saveAsset(after);
    return after;
  });
}

/** Replace one variant by id, keeping order. */
export function withVariant(a: MeshAsset, v: MeshVariant): MeshAsset {
  return { ...a, variants: a.variants.map((x) => (x.id === v.id ? v : x)) };
}

/** Every asset on disk, newest first; an unreadable manifest is skipped, never fatal to the list. */
export async function listAssets(): Promise<MeshAsset[]> {
  let names: string[];
  try {
    names = await readdir(meshRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: MeshAsset[] = [];
  for (const id of names.filter((x) => ASSET_ID_RE.test(x))) {
    const a = await readManifestFile<MeshAsset>(path.join(meshRoot(), id, ASSET_FILE), id, "asset");
    if (a) out.push(a);
  }
  return out.sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
}

/** For /api/foundry/file?kind=mesh: a servable file's absolute path and size, or a 404. */
export async function meshFileStat(id: AssetId, rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveInAsset(id, rel);
  if (!SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("That file type is not served.", 400);
  try {
    const s = await stat(abs);
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the asset.", 404);
  }
}
