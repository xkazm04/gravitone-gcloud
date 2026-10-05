// THE FOUNDRY RUN STORE KERNEL — server only.
//
// Shared filesystem kernel for the three foundry disk layers:
// - lib/foundry/store.ts (the forge)
// - lib/foundry/extract/store.ts (the style extractor)
// - lib/foundry/training/store.ts (the dojo training loop)
//
// Path safety, atomic serialization, and manifest resilience rules are
// defined once here and shared by all three stores.

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
export const SERVABLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".json"]);

export class FoundryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Validate an identifier and resolve its directory under `root`. */
export function runRoot(root: string, id: string, noun = "run"): string {
  if (!RUN_ID_RE.test(id)) throw new FoundryError(`That is not a ${noun} id.`, 400);
  return path.join(root, id);
}

/** Resolve a relative path inside `dir`, refusing directory traversal escapes
 *  and optionally checking that the file extension is servable. */
export function containedIn(dir: string, rel: string, servableOnly = false, noun = "run"): string {
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) {
    throw new FoundryError(`Path is outside the ${noun}.`, 400);
  }
  if (servableOnly && !SERVABLE_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
    throw new FoundryError("Not a servable file.", 400);
  }
  return abs;
}

export async function readJson<T>(file: string): Promise<T | null>;
export async function readJson<T>(file: string, fallback: T): Promise<T>;
export async function readJson<T>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

/** Read a manifest that may be mid-write or damaged. `undefined` means the
 *  file exists but contains malformed JSON (distinct from `null` for absent). */
export async function readManifestFile<T>(
  file: string,
  _id?: string,
  _noun = "run",
): Promise<T | null | undefined> {
  try {
    return await readJson<T | null>(file, null);
  } catch (e) {
    if (e instanceof SyntaxError) return undefined;
    throw e;
  }
}

let counter = 0;

/** Write-then-rename with unique tmp filenames per call to prevent race
 *  conditions when concurrent writers target the same file. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++counter}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && attempt < 9) {
        await new Promise((r) => setTimeout(r, 5 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

/** THE VERSIONED INDICES' ROOT, respecting process.env.FOUNDRY_DIR. */
export function foundryFile(relPath: string): string {
  return path.join(process.env.FOUNDRY_DIR || path.join(process.cwd(), "pipeline", "foundry"), relPath);
}

export interface ManifestWarning {
  id: string;
  reason: string;
}

/** List manifests in a directory, skipping corrupt/damaged ones with a warning. */
export async function listManifests<T, S>(
  dir: string,
  fileName: string,
  summarise: (id: string, manifest: T) => Promise<S | null | undefined> | S | null | undefined,
): Promise<{ items: S[]; warnings: ManifestWarning[] }> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { items: [], warnings: [] };
    throw e;
  }
  const items: S[] = [];
  const warnings: ManifestWarning[] = [];
  for (const name of names) {
    if (!RUN_ID_RE.test(name)) continue;
    const m = await readManifestFile<T>(path.join(dir, name, fileName), name);
    if (m === undefined) {
      const reason = `${fileName} is unreadable`;
      console.warn(`[foundry] ${name}: ${reason} — skipped from the list`);
      warnings.push({ id: name, reason });
      continue;
    }
    if (!m) continue;
    const item = await summarise(name, m);
    if (item != null) items.push(item);
  }
  return { items, warnings };
}
