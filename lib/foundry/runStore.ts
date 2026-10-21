// THE FOUNDRY RUN STORE KERNEL — server only.
//
// Shared filesystem kernel for the three foundry disk layers:
// - lib/foundry/store.ts (the forge)
// - lib/foundry/extract/store.ts (the style extractor)
// - lib/foundry/training/store.ts (the dojo training loop)
//
// Path safety, atomic serialization, and manifest resilience rules are
// defined once here and shared by all three stores.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { catalogueDir } from "../fixtures/roots";
import { renameRetry, retryTransientFs, type RetryOptions } from "../renameRetry";

/** 10 tries, 5 ms longer each time. */
const FS_RETRY: RetryOptions = { retries: 9, delayMs: (attempt) => 5 * (attempt + 1) };

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
  // A concurrent writer's rename can make the read fail transiently with
  // EPERM/EBUSY/EACCES on Windows. Retry briefly (mirror of writeJsonAtomic);
  // the last attempt still throws, so a genuinely unreadable file surfaces.
  let text: string;
  try {
    text = await retryTransientFs(() => readFile(file, "utf8"), FS_RETRY);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
  return JSON.parse(text) as T;
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
  await renameRetry(tmp, file, FS_RETRY);
}

/** THE VERSIONED INDICES' ROOT, respecting process.env.FOUNDRY_DIR. */
export function foundryFile(relPath: string): string {
  return path.join(catalogueDir(), relPath);
}

/** Runs read at once while listing a run directory. */
const LIST_CONCURRENCY = 16;

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
  const runNames = names.filter((n) => RUN_ID_RE.test(n));
  // Bounded fan-out: each run's reads are independent, so they overlap, but a
  // large directory must not open every descriptor at once. Results land in
  // their directory slot so items and warnings keep readdir order.
  const slots: Array<{ item?: S; warning?: ManifestWarning }> = new Array(runNames.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < runNames.length) {
      const i = next++;
      const name = runNames[i];
      const m = await readManifestFile<T>(path.join(dir, name, fileName), name);
      if (m === undefined) {
        slots[i] = { warning: { id: name, reason: `${fileName} is unreadable` } };
        continue;
      }
      if (!m) continue;
      const item = await summarise(name, m);
      if (item != null) slots[i] = { item };
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIST_CONCURRENCY, runNames.length) }, worker));
  const items: S[] = [];
  const warnings: ManifestWarning[] = [];
  for (const slot of slots) {
    if (!slot) continue;
    if (slot.warning) {
      console.warn(`[foundry] ${slot.warning.id}: ${slot.warning.reason} — skipped from the list`);
      warnings.push(slot.warning);
    } else if (slot.item !== undefined) items.push(slot.item);
  }
  return { items, warnings };
}
