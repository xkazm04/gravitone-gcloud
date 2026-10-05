// THE PUBLISHING STORE — three JSON files on this machine's disk. Server-only.
//
// WHY FILES AND NOT A DATABASE. StatReel kept its calendar in SQLite
// (apps/server/src/db.ts) and leaned on better-sqlite3 being synchronous for
// its at-most-once claim ("in this process no tick can observe the gap",
// calendar.ts tick()). Gravitone has no database and the brief rules one out,
// and the foundry already keeps its state as JSON under `foundry-out/`
// (lib/foundry/extract/store.ts:82 — tmp + rename). So this is that shape:
//
//   <root>/schedule.json       { version, slots: ScheduleSlot[], claims }
//   <root>/publications.json   { version, publications: Publication[] }
//   <root>/metrics.json        { version, snapshots: MetricSnapshot[] }
//   <root>/plans/<slotId>.json the request plan a dry run WOULD have sent
//   <root>/sessions/<slotId>.json  a live resumable-upload session to resume
//
// TWO WRITERS, NOT ONE, AND THAT IS WHY THERE IS A LOCK FILE. The Next server
// (the Calendar UI's routes) and `pipeline/publish.mts` (the headless CLI an
// agent drives) are separate processes writing the same files. An in-process
// promise queue alone would let the CLI's `tick` claim a slot while the
// server's sweep rewrote schedule.json from a read taken a moment earlier — the
// claim lost, and the at-most-once promise with it. So every mutation runs
// under BOTH: the in-process queue (cheap ordering inside one process) and an
// exclusive-create lock file (`open(…, "wx")`) that the other process honours.
// A lock older than LOCK_STALE_MS is a crashed holder and is broken.
//
// ATOMIC WRITES. Each file is written to `<file>.<pid>.<n>.tmp` and renamed
// over the original, so a reader never sees half a file. A corrupt file is NOT
// silently replaced with an empty one — that would erase a calendar — it
// throws, and the caller reports it.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { exclusiveSection } from "../diskTx";

import type { MetricSnapshot, Publication, ScheduleSlot } from "./types";

/** A claim on a slot that is being published right now (tick or publish-now). */
export interface SlotClaim {
  pid: number;
  at: string;
}

export interface ScheduleFile {
  version: 1;
  slots: ScheduleSlot[];
  /** slotId -> who is publishing it. Kept OUT of ScheduleSlot so the wire type
   *  stays exactly the contract (lib/publish/types.ts) and the claim — process
   *  bookkeeping, not work data — never reaches a client. */
  claims: Record<string, SlotClaim>;
}
export interface PublicationsFile {
  version: 1;
  publications: Publication[];
}
export interface MetricsFile {
  version: 1;
  snapshots: MetricSnapshot[];
}

/** Read lazily per call, so a test (or the CLI) can point the store at a temp
 *  directory with PUBLISH_STORE_DIR after this module was imported. */
export function storeRoot(): string {
  const env = process.env.PUBLISH_STORE_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "publish");
}

export const planPath = (slotId: string) => path.join(storeRoot(), "plans", `${safeId(slotId)}.json`);
export const sessionPath = (slotId: string) => path.join(storeRoot(), "sessions", `${safeId(slotId)}.json`);

/** Slot ids are minted here (`sl-<8 hex>`), but a plan path is built from an id
 *  a CLI argument or a URL segment carries, so it is held to the minted shape. */
export function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new StoreError(`not a valid id: ${JSON.stringify(id)}`);
  return id;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

const FILES = {
  schedule: "schedule.json",
  publications: "publications.json",
  metrics: "metrics.json",
} as const;

const EMPTY = {
  schedule: (): ScheduleFile => ({ version: 1, slots: [], claims: {} }),
  publications: (): PublicationsFile => ({ version: 1, publications: [] }),
  metrics: (): MetricsFile => ({ version: 1, snapshots: [] }),
};

type Kind = keyof typeof FILES;
type Shape = { schedule: ScheduleFile; publications: PublicationsFile; metrics: MetricsFile };

async function readKind<K extends Kind>(kind: K): Promise<Shape[K]> {
  const file = path.join(storeRoot(), FILES[kind]);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return EMPTY[kind]() as Shape[K];
    throw e;
  }
  try {
    const parsed = JSON.parse(raw) as Shape[K];
    // an older schedule.json without `claims` is still a calendar
    if (kind === "schedule") (parsed as ScheduleFile).claims ??= {};
    return parsed;
  } catch (e) {
    throw new StoreError(`${file} is not valid JSON (${(e as Error).message}); refusing to overwrite it`);
  }
}

let tmpCounter = 0;

/** tmp + rename: a reader sees the old file or the new one, never half of one. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

// ── locking ──────────────────────────────────────────────────────────────────
//
// The queue + exclusive-create lock live in lib/diskTx.ts now (the foundry
// catalogue is the third store to need them); the timing and the refusal text
// are this store's, unchanged.

const LOCK_TIMING = { staleMs: 30_000, waitMs: 10_000 };

const exclusive = exclusiveSection(
  () => path.join(storeRoot(), ".lock"),
  () => ({
    timing: LOCK_TIMING,
    onTimeout: (lock, waitMs) => new StoreError(`the publish store is locked (${lock}) and the holder did not release it in ${waitMs} ms`),
  }),
);

/** Run `fn` with exclusive access to the store, in this process AND across
 *  processes. Every read-modify-write of the store goes through here. */
export function withStore<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
  return exclusive(async () => {
    const tx = new StoreTx();
    const out = await fn(tx);
    await tx.commit();
    return out;
  });
}

/** A transaction: loads each file at most once, writes back only what was touched. */
export class StoreTx {
  private loaded: { [K in Kind]?: Shape[K] } = {};
  private dirty = new Set<Kind>();

  async get<K extends Kind>(kind: K): Promise<Shape[K]> {
    const have = this.loaded[kind] as Shape[K] | undefined;
    if (have) return have;
    const fresh = await readKind(kind);
    (this.loaded as Record<Kind, unknown>)[kind] = fresh;
    return fresh;
  }

  /** Mark a loaded file as changed; it is written when the transaction ends. */
  touch(kind: Kind): void {
    this.dirty.add(kind);
  }

  async commit(): Promise<void> {
    for (const kind of this.dirty) await writeJsonAtomic(path.join(storeRoot(), FILES[kind]), this.loaded[kind]);
    this.dirty.clear();
  }
}

/** Unlocked snapshot reads, for GETs. Atomic writes make each file
 *  self-consistent; across files a read may be one mutation apart, which no
 *  reader here depends on. */
export const readSchedule = () => readKind("schedule");
export const readPublications = () => readKind("publications");
export const readMetrics = () => readKind("metrics");
