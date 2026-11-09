// THE FOUNDRY RUN STORE KERNEL — server only.
//
// Shared filesystem kernel for the three foundry disk layers:
// - lib/foundry/store.ts (the forge)
// - lib/foundry/extract/store.ts (the style extractor)
// - lib/foundry/training/store.ts (the dojo training loop)
//
// Path safety, atomic serialization, and manifest resilience rules are
// defined once here and shared by all three stores.

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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

// THE READ CACHE - a run's JSON read again only when the file changed (spark fable-ten, package I).
//
// The Floor and Runs re-read every v1 store on each router.refresh (an event, or the 20 s
// backstop), and the foundry listings read run.json + verdicts.json for every run directory,
// twice per run for the forge (scanRuns, then getRun). Measured by pipeline/read-cost.mts on 50
// forge + 50 extract runs: ~500 file reads, about half of a warm loadFloor. A `stat` is ~20x
// cheaper than open+read+close on this box (Windows, 67 manifests: 1.3 ms against 25 ms in
// parallel), and JSON.parse is ~10% of the read, so the TEXT is kept and parsed on every call:
// each caller still gets its own fresh object, and nothing a caller mutates can reach another.
//
// WHY A HIT IS NEVER STALE. The key is the file's own stat - size, mtime and ctime to the
// nanosecond, and its inode (file index on Windows) - not its directory's: a directory's mtime
// does not move when a file inside it is rewritten in place. writeJsonAtomic renames a new file
// in (a new inode and ctime); an in-place rewrite moves mtime and ctime, and ctime cannot be set
// back by utimes. The one hole is a same-size rewrite inside one tick of a coarse filesystem
// clock (FAT's 2 s, a jiffy on some Linux mounts), so git's "racily clean" rule closes it: text
// read from a file whose mtime is within RACY_MS of now is returned but NOT kept, and the next
// read goes to the disk until the file has been quiet that long. The stat comes before the read,
// so a write landing between them leaves newer text under an older key - the next stat misses.
//
// BOUNDED: READ_CACHE_ENTRIES files and READ_CACHE_BYTES of text, least recently used out
// first. Keyed by absolute path, so two store roots (the tests' many temp dirs) never share an
// entry, and a dead temp root's entries age out instead of pinning memory.

export const READ_CACHE_ENTRIES = 2048;
export const READ_CACHE_BYTES = 64 * 1024 * 1024;
const RACY_MS = 2_000;

type Cached = { readonly sig: string; readonly text: string };
const cache = new Map<string, Cached>();
let cacheBytes = 0;
const counts = { hits: 0, misses: 0 };

const sizeOf = (text: string): number => text.length * 2;

function forget(key: string): void {
  const old = cache.get(key);
  if (old === undefined) return;
  cache.delete(key);
  cacheBytes -= sizeOf(old.text);
}

function keep(key: string, entry: Cached): void {
  forget(key);
  if (sizeOf(entry.text) > READ_CACHE_BYTES) return;
  cache.set(key, entry);
  cacheBytes += sizeOf(entry.text);
  // A Map iterates in insertion order, and a hit re-inserts, so the first key is the coldest.
  while (cache.size > READ_CACHE_ENTRIES || cacheBytes > READ_CACHE_BYTES) {
    const coldest = cache.keys().next();
    if (coldest.done === true) break;
    forget(coldest.value);
  }
}

/** The file's text, from the cache when its stat is unchanged. Throws as readFile does (ENOENT). */
async function readText(file: string): Promise<string> {
  const key = path.resolve(file);
  let s;
  try {
    s = await retryTransientFs(() => stat(key, { bigint: true }), FS_RETRY);
  } catch (e) {
    forget(key);
    throw e;
  }
  const sig = `${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.ino}`;
  const hit = cache.get(key);
  if (hit !== undefined && hit.sig === sig) {
    cache.delete(key);
    cache.set(key, hit);
    counts.hits++;
    return hit.text;
  }
  counts.misses++;
  const text = await retryTransientFs(() => readFile(key, "utf8"), FS_RETRY);
  if (Number(s.mtimeMs) < Date.now() - RACY_MS) keep(key, { sig, text });
  else forget(key);
  return text;
}

/** What the read cache holds and has served (tests, and pipeline/read-cost.mts). */
export function readCacheStats(): { readonly entries: number; readonly bytes: number; readonly hits: number; readonly misses: number; readonly keys: readonly string[] } {
  return { entries: cache.size, bytes: cacheBytes, hits: counts.hits, misses: counts.misses, keys: [...cache.keys()] };
}

/** Empty the read cache (a test's clean start; a measurement's cold read). */
export function clearReadCache(): void {
  cache.clear();
  cacheBytes = 0;
  counts.hits = 0;
  counts.misses = 0;
}

export async function readJson<T>(file: string): Promise<T | null>;
export async function readJson<T>(file: string, fallback: T): Promise<T>;
export async function readJson<T>(file: string, fallback: T | null = null): Promise<T | null> {
  // A concurrent writer's rename can make the read fail transiently with
  // EPERM/EBUSY/EACCES on Windows. Retry briefly (mirror of writeJsonAtomic);
  // the last attempt still throws, so a genuinely unreadable file surfaces.
  let text: string;
  try {
    text = await readText(file);
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
