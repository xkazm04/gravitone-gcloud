import { stat, readFile } from "node:fs/promises";
import { hostname } from "node:os";

import { err, ok, type Result } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import { finishClaim, takeClaim } from "@gt/kernel/ingest";
import type { IndexContext, LibraryEntry, StyleFacets } from "@gt/kernel/library/core";
import { ingested, pruneFeed, rememberIngest, upsertItems, type IngestMemo } from "@gt/kernel/library/write";
import type { Store } from "@gt/kernel/store";
import { probeMissing, type FactsQueued, type MediaProbe } from "@gt/producers/media-facts/run";

import type { Feed, FeedCtx, FeedItem, FeedRead } from "./feeds/types.ts";

// THE LIBRARY PROJECTION (Phase 5, COMMON decision 5) - every feed read, its file
// media ingested into blobs, its items upserted into the kernel's Library index,
// what it no longer holds pruned, and the new media probed for its facts.
//
// The Phase 2 ledger sync is the pattern (lib/ledger/v1/sync.ts): readers go
// through v1's own code and write nothing of v1's; one feed failing never stops
// another; a failed feed is NOT pruned (a reader that could not read must not be
// read as "it holds nothing"); every write is keyed and idempotent, so two syncs
// at once, or a sync killed half way, converge on the next run.
//
// WHEN IT RUNS: on demand (`node pipeline/library-sync.mts`), or on read -
// `freshLibrary()` (./fresh.ts) takes the store's `library-sync` claim (kernel
// ingest: one conditional write, a TTL) and starts a sync without awaiting it.
//
// MEDIA FACTS are a queued job (L53): after the upserts the sync asks `queue`
// (packages/producers/src/media-facts/run.ts `queueFacts`) to enqueue one
// `media-facts` job when an item's blob has no facts and none is open; the worker
// probes on box.render. A render request never runs ffprobe. `probe` - the same
// work in process, bounded per sync - is the CLI's `--inline` and the tests'.

export const LIBRARY_CLAIM = "library-sync";
export const LIBRARY_SYNC_INTERVAL_MS = 60_000;
export const LIBRARY_SYNC_TTL_MS = 10 * 60_000;
const BATCH = 500;

export type FeedReport = {
  readonly feed: string;
  readonly items: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly pruned: number;
  readonly ingested: number;
  /** Files an item names that are not on disk: drawn as `missing`, never dropped. */
  readonly missingFiles: number;
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
  readonly failed?: string;
};

export type LibrarySyncReport = {
  readonly at: string;
  readonly universe: FeedCtx["universe"];
  readonly feeds: readonly FeedReport[];
  readonly facts?: { readonly probed: number; readonly undecodable: number; readonly failed: readonly string[] } | { readonly queue: FactsQueued } | { readonly error: string };
};

export type SyncOptions = {
  /** Probe in process (the CLI's `--inline`); wins over `queue`. */
  readonly probe?: MediaProbe;
  /** Queue the probe as a job for the worker (the app's sync). */
  readonly queue?: (store: Store) => Result<FactsQueued>;
  /** Most blobs probed per sync. */
  readonly probeLimit?: number;
  readonly now?: () => Date;
};

const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A file into a blob, re-hashed only when its size or mtime moved. Null when the file is not there. */
async function ingest(store: Store, blobs: BlobStore, file: { abs: string; mime: string }, memos: IngestMemo[]): Promise<Result<{ sha256: string; bytes: number; mime: string } | null>> {
  let st;
  try {
    st = await stat(file.abs);
  } catch {
    return ok(null);
  }
  if (!st.isFile()) return ok(null);
  const held = ingested(store, file.abs, st.size, st.mtimeMs);
  if (!held.ok) return held;
  if (held.value !== null && held.value.mime === file.mime) return ok({ sha256: held.value.sha, bytes: st.size, mime: file.mime });
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file.abs));
  } catch (e) {
    return err("unavailable", `library: cannot read ${file.abs}: ${words(e)}`);
  }
  const ref = await blobs.put(bytes, file.mime);
  if (!ref.ok) return ref;
  memos.push({ path: file.abs, size: st.size, mtimeMs: st.mtimeMs, sha: ref.value.sha256, mime: file.mime });
  return ok(ref.value);
}

async function entriesOf(store: Store, blobs: BlobStore, feed: string, items: readonly FeedItem[]): Promise<Result<{ entries: LibraryEntry[]; ingested: number; missing: number }>> {
  const entries: LibraryEntry[] = [];
  const memos: IngestMemo[] = [];
  let missing = 0;
  for (const it of items) {
    let item = it.item;
    if (it.file !== undefined) {
      const ref = await ingest(store, blobs, it.file, memos);
      if (!ref.ok) return ref;
      if (ref.value === null) missing++;
      else item = { ...item, media: ref.value };
    }
    entries.push({ item, meta: it.meta, extras: it.extras, feed });
  }
  if (memos.length > 0) {
    const m = rememberIngest(store, memos);
    if (!m.ok) return m;
  }
  return ok({ entries, ingested: memos.length, missing });
}

/**
 * Read every feed and bring the index in line with it. Always resolves with a
 * report; a feed that failed is IN the report with its words. `err` only when the
 * store itself refused a write the report could not survive.
 */
export async function syncLibrary(store: Store, blobs: BlobStore, feeds: readonly Feed[], ctx: FeedCtx, opts: SyncOptions = {}): Promise<Result<LibrarySyncReport>> {
  const now = opts.now ?? (() => new Date());
  type Read = { readonly feed: string; readonly read: FeedRead } | { readonly feed: string; readonly failed: string };
  const reads = await Promise.all(
    feeds.map(async (f): Promise<Read> => {
      try {
        return { feed: f.id, read: await f.read(ctx) };
      } catch (e) {
        return { feed: f.id, failed: words(e) };
      }
    }),
  );
  const styles = new Map<string, StyleFacets>();
  for (const r of reads) if ("read" in r) for (const [k, v] of r.read.styles ?? []) styles.set(k, v);
  const index: IndexContext = { styleOf: (id) => styles.get(id) };

  const reports: FeedReport[] = [];
  for (const r of reads) {
    const empty = { items: 0, inserted: 0, updated: 0, unchanged: 0, pruned: 0, ingested: 0, missingFiles: 0, skipped: [] };
    if (!("read" in r)) {
      reports.push({ feed: r.feed, ...empty, failed: r.failed });
      continue;
    }
    const built = await entriesOf(store, blobs, r.feed, r.read.items);
    if (!built.ok) {
      reports.push({ feed: r.feed, ...empty, skipped: r.read.skipped, failed: built.error.message });
      continue;
    }
    const n = { inserted: 0, updated: 0, unchanged: 0 };
    let failed: string | undefined;
    for (let i = 0; i < built.value.entries.length; i += BATCH) {
      const up = upsertItems(store, built.value.entries.slice(i, i + BATCH), index);
      if (!up.ok) {
        failed = up.error.message;
        break;
      }
      n.inserted += up.value.inserted;
      n.updated += up.value.updated;
      n.unchanged += up.value.unchanged;
    }
    // Pruned only after a whole, clean read: a half-written feed keeps what it had.
    const pruned = failed === undefined ? pruneFeed(store, r.feed, new Set(built.value.entries.map((e) => e.item.id))) : ok(0);
    if (!pruned.ok) failed = pruned.error.message;
    reports.push({
      feed: r.feed,
      items: built.value.entries.length,
      ...n,
      pruned: pruned.ok ? pruned.value : 0,
      ingested: built.value.ingested,
      missingFiles: built.value.missing,
      skipped: r.read.skipped,
      ...(failed === undefined ? {} : { failed }),
    });
  }

  let facts: LibrarySyncReport["facts"];
  if (opts.probe !== undefined) {
    const p = await probeMissing(store, blobs, opts.probe, { limit: opts.probeLimit ?? 200, now });
    facts = p.ok ? p.value : { error: p.error.message };
  } else if (opts.queue !== undefined) {
    const q = opts.queue(store);
    facts = q.ok ? { queue: q.value } : { error: q.error.message };
  }
  return ok({ at: now().toISOString(), universe: ctx.universe, feeds: reports, ...(facts === undefined ? {} : { facts }) });
}

export type Freshness = { readonly started: true } | { readonly started: false; readonly nextAt: string; readonly owner: string };

/** Start a sync in the background if the claim is free; never await it (the ledger's `syncSoon`). */
export function syncLibrarySoon(store: Store, blobs: BlobStore, feeds: readonly Feed[], ctx: FeedCtx, opts: SyncOptions = {}): Result<Freshness> {
  const owner = `${hostname()}/${process.pid}`;
  const claim = takeClaim(store, LIBRARY_CLAIM, owner, LIBRARY_SYNC_TTL_MS);
  if (!claim.ok) return claim;
  if (!claim.value.won) return ok({ started: false, nextAt: claim.value.nextAt, owner: claim.value.owner });
  void syncLibrary(store, blobs, feeds, ctx, opts)
    .then((report) => {
      const done = finishClaim(store, LIBRARY_CLAIM, owner, LIBRARY_SYNC_INTERVAL_MS, report.ok ? report.value : { error: report.error.message });
      if (!report.ok) console.error(`[library-sync] ${report.error.message}`);
      if (!done.ok) console.error(`[library-sync] the claim could not be closed: ${done.error.message}`);
    })
    .catch((e: unknown) => console.error(`[library-sync] failed outside its own report: ${words(e)}`));
  return ok({ started: true });
}
