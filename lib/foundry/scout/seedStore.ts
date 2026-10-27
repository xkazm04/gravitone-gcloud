// THE SEED STORE - server only (spark scout-decision-graph). One directory per batch under
// <scoutRoot>/seeds/<batchId>/batch.json (./types.ts SeedBatch). The root is the active wing's, read per call
// as the night store does (its env var redirects it), so a test or a rehearsal never writes the checkout's.
//
// A batch is written WHOLE by one door call (./seeds.ts) and then only its `committed` changes (the Board's
// apply). Every writer goes through `mutateSeedBatch`, under the batch directory's lock file, so the CLI and
// the Board queue instead of losing an update. The id sequence is the night store's (`YYYY-MM-DD`, `-2`...),
// reserved by a non-recursive mkdir, so two writers never take the same id.

import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { FoundryError, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { scoutRoot } from "./store";
import { SEED_BATCH_ID_RE, SEED_REF_RE, type Seed, type SeedBatch, type SeedBatchId, type SeedRef } from "./types";

const BATCH_FILE = "batch.json";

export function seedsRoot(): string {
  return path.join(scoutRoot(), "seeds");
}

export function batchDir(id: SeedBatchId): string {
  if (!SEED_BATCH_ID_RE.test(id)) throw new FoundryError(`That is not a seed batch id: ${id}.`, 400);
  return path.join(seedsRoot(), id);
}

/** The packet a batch is decided in. */
export const seedsPacketId = (id: SeedBatchId): string => `pkt:seeds:${id}`;

/** Split a seed ref into its batch and seed id; null for anything that is not one. */
export function splitSeedRef(ref: string): { readonly batch: SeedBatchId; readonly seed: string } | null {
  if (!SEED_REF_RE.test(ref)) return null;
  const i = ref.indexOf("/");
  return { batch: ref.slice(0, i), seed: ref.slice(i + 1) };
}

/* ── Create ───────────────────────────────────────────────────────────────── */

/**
 * Reserve the next batch id for `day` and write the batch whole. `make` receives the id and returns the
 * batch to store (the door validates before calling this, so a refusal writes nothing).
 */
export async function createSeedBatch(day: string, make: (id: SeedBatchId) => SeedBatch): Promise<SeedBatch> {
  const root = seedsRoot();
  await mkdir(root, { recursive: true });
  for (let i = 0; i < 50; i++) {
    const id = i === 0 ? day : `${day}-${i + 1}`;
    try {
      await mkdir(path.join(root, id));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    const batch = make(id);
    if (batch.id !== id) throw new FoundryError(`A seed batch was made as ${batch.id} for the reserved id ${id}.`, 500);
    await writeJsonAtomic(path.join(root, id, BATCH_FILE), batch);
    return batch;
  }
  throw new FoundryError(`Too many seed batches on ${day}.`, 409);
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

export async function readSeedBatch(id: SeedBatchId): Promise<SeedBatch> {
  const file = path.join(batchDir(id), BATCH_FILE);
  const b = await readManifestFile<SeedBatch>(file, id, "seed batch");
  if (b === undefined) throw new FoundryError(`The seed batch ${id} is unreadable - a writer may be mid-write; try again, else inspect ${file}.`, 503);
  if (!b) throw new FoundryError(`No seed batch called ${id}.`, 404);
  return b;
}

/** Every batch on disk that can be read, newest first (by createdAt). An unreadable one is skipped. */
export async function listSeedBatches(): Promise<SeedBatch[]> {
  let names: string[];
  try {
    names = await readdir(seedsRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: SeedBatch[] = [];
  for (const id of names.filter((x) => SEED_BATCH_ID_RE.test(x))) {
    const b = await readManifestFile<SeedBatch>(path.join(seedsRoot(), id, BATCH_FILE), id, "seed batch");
    if (b) out.push(b);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** One seed by ref across batches, with its batch; undefined when either is missing. */
export function seedOf(batches: readonly SeedBatch[], ref: SeedRef): { readonly batch: SeedBatch; readonly seed: Seed } | undefined {
  const r = splitSeedRef(ref);
  if (r === null) return undefined;
  const batch = batches.find((b) => b.id === r.batch);
  const seed = batch?.seeds.find((s) => s.id === r.seed);
  return batch === undefined || seed === undefined ? undefined : { batch, seed };
}

/** A seed's ancestry, nearest first, itself included: `[ref, parent, grandparent, ...]`. A cycle or a missing parent ends it. */
export function ancestryOf(batches: readonly SeedBatch[], ref: SeedRef): SeedRef[] {
  const out: SeedRef[] = [];
  let at: SeedRef | undefined = ref;
  while (at !== undefined && !out.includes(at)) {
    out.push(at);
    at = seedOf(batches, at)?.seed.parent;
  }
  return out;
}

/** True when the ref names a seed a LIVE (non-dry) batch committed as kept. */
export function isKeptSeed(batches: readonly SeedBatch[], ref: SeedRef): boolean {
  const s = seedOf(batches, ref);
  return s !== undefined && s.batch.committed !== undefined && !s.batch.committed.dry && s.batch.committed.kept.includes(s.seed.id);
}

/* ── Write ────────────────────────────────────────────────────────────────── */

/** Read, change, write under the batch's lock. `fn` returns the whole next batch; the same object writes nothing. */
export async function mutateSeedBatch(id: SeedBatchId, fn: (b: SeedBatch) => SeedBatch): Promise<SeedBatch> {
  return withRunLock(batchDir(id), async () => {
    const before = await readSeedBatch(id);
    const after = fn(before);
    if (after !== before) await writeJsonAtomic(path.join(batchDir(id), BATCH_FILE), after);
    return after;
  });
}
