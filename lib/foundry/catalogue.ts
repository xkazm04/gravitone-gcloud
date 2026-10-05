// THE FOUNDRY CATALOGUE'S ONE WRITE PATH — server only.
//
// pipeline/foundry/ holds three git-tracked indices — styles.json, ledger.json,
// training-ledger.json — and FIVE writers: the forge, extract and Dojo commits
// here, acquire.py and `intake --acquire` (which shells out to acquire.py) in
// Python. Each used to read-modify-write with nothing held between the read
// and the write, so two that overlapped lost one write with a 200 on both, and
// the commit-plan token (commitPlan.ts) was compared before the writes with no
// fence around either. Measured 2026-10-05 by
// tests/golden-path/foundry-commit-race.probe.spec.ts: four lost updates in
// four schedules.
//
// `withCatalogue(meta, fn)` is the fence:
//
//   · EXCLUSION. lib/diskTx.ts's in-process queue plus an exclusive-create
//     lock at pipeline/foundry/.catalogue.lock, which
//     pipeline/foundry/catalogue_lock.py takes by the same protocol. A commit
//     computes its plan, checks its token and writes INSIDE `fn`, so the
//     check and the writes sit behind one fence.
//   · REVISION. styles.json carries `_rev`, the catalogue revision: one per
//     transaction that writes any index, whichever index it wrote. GET
//     /api/foundry/styles returns it, so a client can tell the catalogue moved.
//   · JOURNAL. catalogue-journal.jsonl gets one line per transaction,
//     `{rev, at, op, run, ids, by}`, appended BEFORE the first index write
//     (write-ahead). A retry after a crash finds its own line as the newest
//     one and REUSES that revision instead of minting another, which is what
//     lets a retried commit converge on the uninterrupted result
//     (concurrency-guards#idempotency-by-design; the crash prefixes are
//     enumerated in tests/golden-path/foundry-catalogue-tx.probe.spec.ts).
//     Revisions are minted as max(styles._rev, newest journal rev) + 1, so a
//     line whose commit never landed is never handed out twice.
//
// THE INDICES STAY ON THE PORT. Every index read and write goes through
// lib/foundry/fsPort.ts, which is how the effect-log harness enumerates crash
// points and interleavings. The lock file and the journal do not: they are
// the fence and its record, not the state being fenced, and putting them on
// the port would let a probe "crash" a lock acquisition — which a real crash
// cannot do — and renumber every mutation the crash lane pins.

import { appendFile, readFile } from "node:fs/promises";

import { DEFAULT_LOCK_TIMING, exclusiveSection, type LockTiming } from "../diskTx";
import { foundryFs } from "./fsPort";
import { FoundryError, foundryFile } from "./runStore";
import type { TrainingLedgerRow } from "./training/types";
import type { LedgerRow, StyleDef } from "./types";

export const CATALOGUE_LOCK = ".catalogue.lock";
export const CATALOGUE_JOURNAL = "catalogue-journal.jsonl";

/** The app's three commits; acquire.py journals as "acquire". */
export type CatalogueOp = "forge-commit" | "extract-commit" | "dojo-commit";

export interface JournalLine {
  rev: number;
  at: string;
  op: string;
  /** The run, extract run, cycle or readback source the transaction committed. */
  run: string;
  /** What it touched: style ids, written catalogue ids, improvement ids. */
  ids: string[];
  /** "app" for this module, "acquire.py" for Python. */
  by: string;
}

export interface CatalogueDocs {
  "styles.json": { styles: StyleDef[]; _rev?: number } & Record<string, unknown>;
  "ledger.json": { rows: LedgerRow[] } & Record<string, unknown>;
  "training-ledger.json": { rows: TrainingLedgerRow[] } & Record<string, unknown>;
}
export type CatalogueIndex = keyof CatalogueDocs;

const EMPTY: { [K in CatalogueIndex]: () => CatalogueDocs[K] } = {
  "styles.json": () => ({ styles: [] }),
  "ledger.json": () => ({ rows: [] }),
  "training-ledger.json": () => ({ rows: [] }),
};

let timing: LockTiming | null = null;

/** PROBE ONLY, the same posture as __setFoundryFsPort: shorten the wait bound
 *  so the 503 path runs in milliseconds. null restores the defaults. */
export function __setCatalogueLockTiming(t: LockTiming | null): void {
  timing = t;
}

const exclusive = exclusiveSection(
  () => foundryFile(CATALOGUE_LOCK),
  () => ({
    timing: timing ?? DEFAULT_LOCK_TIMING,
    by: "app",
    onTimeout: (lock, waitMs) =>
      new FoundryError(
        `The style catalogue is locked (${lock}) and the holder did not release it in ${waitMs} ms. Another commit or acquire.py is writing it; try again, and if nothing is running, delete the lock file.`,
        503,
      ),
  }),
);

async function newestJournalLine(): Promise<JournalLine | null> {
  let raw: string;
  try {
    raw = await readFile(foundryFile(CATALOGUE_JOURNAL), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as JournalLine;
    } catch {
      // A torn tail (a writer killed mid-append) is skipped, never fatal.
    }
  }
  return null;
}

export class CatalogueTx {
  private loaded: { [K in CatalogueIndex]?: CatalogueDocs[K] } = {};
  private rev: number | null = null;
  private stamped = false;

  constructor(private readonly meta: { op: CatalogueOp; run: string }) {}

  /** The revision this transaction writes under; null until `begin`. */
  get revision(): number | null {
    return this.rev;
  }

  /** Load an index once per transaction, through the port. */
  async read<K extends CatalogueIndex>(name: K): Promise<CatalogueDocs[K]> {
    const have = this.loaded[name];
    if (have) return have;
    const doc = await foundryFs().readJson<CatalogueDocs[K]>(foundryFile(name), EMPTY[name]());
    (this.loaded as Record<CatalogueIndex, unknown>)[name] = doc;
    return doc;
  }

  /** Mint (or, on a retry, recover) the revision and journal it — before any
   *  index is written. Call once, after the plan and its token check. */
  async begin(ids: string[]): Promise<number> {
    if (this.rev !== null) return this.rev;
    const current = (await this.read("styles.json"))._rev ?? 0;
    const last = await newestJournalLine();
    if (last && last.op === this.meta.op && last.run === this.meta.run && last.rev >= current) {
      // The newest line is this very commit's, written by an attempt that
      // died after journaling: same revision, no second line.
      this.rev = last.rev;
      return this.rev;
    }
    this.rev = Math.max(current, last?.rev ?? 0) + 1;
    const line: JournalLine = { rev: this.rev, at: new Date().toISOString(), op: this.meta.op, run: this.meta.run, ids, by: "app" };
    await appendFile(foundryFile(CATALOGUE_JOURNAL), `${JSON.stringify(line)}\n`, "utf8");
    return this.rev;
  }

  /** Write a loaded index through the port. styles.json is stamped with the
   *  transaction's revision. */
  async write(name: CatalogueIndex): Promise<void> {
    if (this.rev === null) throw new Error(`catalogue: ${name} written before begin() — the journal must lead the write`);
    const doc = this.loaded[name];
    if (!doc) throw new Error(`catalogue: ${name} written without being read in this transaction`);
    if (name === "styles.json") {
      (doc as CatalogueDocs["styles.json"])._rev = this.rev;
      this.stamped = true;
    }
    await foundryFs().writeJsonAtomic(foundryFile(name), doc);
  }

  /** Carry the revision onto styles.json when the commit wrote only another
   *  index (the Dojo commit). A no-op once styles.json was written. */
  async stamp(): Promise<void> {
    if (this.stamped || this.rev === null) return;
    await this.read("styles.json");
    await this.write("styles.json");
  }
}

/** Run one catalogue transaction under the lock. Everything that reads an
 *  index to decide what to write — plan, token check, the writes — belongs
 *  inside `fn`. */
export function withCatalogue<T>(meta: { op: CatalogueOp; run: string }, fn: (tx: CatalogueTx) => Promise<T>): Promise<T> {
  return exclusive(async () => {
    const tx = new CatalogueTx(meta);
    const out = await fn(tx);
    // A transaction that journaled always lands its revision.
    await tx.stamp();
    return out;
  });
}
