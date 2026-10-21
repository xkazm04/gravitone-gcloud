import "server-only";

import { hostname } from "node:os";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { countEvents, facetMap } from "@gt/kernel/events-count";
import { appendOnce, finishClaim, recordSourceOutcome, takeClaim } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { FIXTURE_MODE } from "../../../lib/fixtures/mode.ts";
import { kernel } from "../../kernelStore.ts";
import { errorMessage } from "@gt/domain/errors";

import { digest, facts, seg } from "./facts.ts";
import { weirPacketId } from "./packet.ts";
import { V1_SOURCES } from "./sources.ts";
import type { IngestEvent, LiveHold, LiveJob, LiveSlot, ProjectCtx, Projection, Source, WeirItem } from "./types.ts";

// THE SYNC - every v1 source read, projected, and appended once (Phase 2).
//
// WHEN IT RUNS. Two ways, and neither is a timer nobody is looking at:
//   - on demand: `node pipeline/ledger-sync.mts` (the operator, a probe, a cron
//     on the render box) runs `syncV1` and prints the per-source table;
//   - on read: a page that shows the ledger (/ledger, Runs) calls `freshLedger()`
//     while it renders. That takes the store's sync claim (kernel/ingest: one
//     conditional write, so two processes - the dev server and a CLI, or two
//     Next workers - never sync at once) when the last sync finished more than
//     SYNC_INTERVAL_MS ago, starts the sync WITHOUT awaiting it, and returns.
//     The render reads what the ledger holds now; what the sync appends reaches
//     the page through the SSE stream (app/api/events/stream). A sync never
//     blocks a render, and an idle studio never syncs.
// Rejected: a ticker in instrumentation.ts `register()`. It would run in every
// Next worker and in `next build`, sync while nobody looks, and still need the
// claim to keep workers apart - all cost, no reader (embedded-db:
// quiet-window-maintenance asks for activity, not a bare timer).
//
// ONE SOURCE FAILING NEVER STOPS ANOTHER. A source whose reader throws (an
// unreadable directory, a manifest that drifted past the door) is reported with
// the reader's own words and an `ingest.fail` event keyed by (source, class,
// error digest) - one row per distinct failure, not one per sync; the streak of
// consecutive failures lives in kernel/ingest's source health table, where a
// dedupe cannot hide it (delivery-guarantees: retry-escalation).
//
// BATCHES. Events are appended BATCH at a time, one transaction each, so the
// write lock is held for milliseconds and a crash loses at most one batch -
// which the next sync appends, because every event is keyed. A batch of 200
// new rows measured p50 16 ms, p95 29 ms (2026-10-15, this machine, WAL with
// synchronous=FULL; 200 already-held keys: 13 ms), so a writer that waits for
// the lock waits for one batch, never for the backfill.

export const BATCH = 200;
export const SYNC_CLAIM = "v1-sync";
/** How stale the ledger may be before a reader starts a sync. */
export const SYNC_INTERVAL_MS = 30_000;
/** How long a sync may run before its claim counts as dead. */
export const SYNC_TTL_MS = 5 * 60_000;

const SYNC: Actor = { kind: "machine", id: "ledger-sync" };

export type FailureClass = "read" | "project" | "append";

export type SourceReport = {
  readonly source: string;
  /** Records the source held, by the tally's own count. */
  readonly records: number;
  readonly events: number;
  readonly appended: number;
  readonly existing: number;
  /** Keys that came back with different content (kernel/ingest `same: false`). */
  readonly drifted: number;
  readonly skipped: number;
  readonly live: number;
  readonly weir: number;
  readonly failed?: { readonly class: FailureClass; readonly error: string };
  /** Consecutive failed syncs of this source, after this one. */
  readonly streak: number;
};

export type SyncReport = {
  readonly at: string;
  readonly universe: ProjectCtx["universe"];
  readonly sources: readonly SourceReport[];
  readonly appended: number;
  readonly failed: number;
};

export type Read = { readonly source: string; readonly projection: Projection } | { readonly source: string; readonly failure: { readonly class: FailureClass; readonly error: string } };

/** The context a sync in this process projects under. */
export function v1Ctx(now: Date = new Date()): ProjectCtx {
  return { now, universe: FIXTURE_MODE ? "fixture" : "real" };
}

/** Read and project one source; a throw anywhere becomes a classed failure, never an escape. */
async function readOne(src: Source<unknown>, ctx: ProjectCtx): Promise<Read> {
  let snapshot: Result<unknown>;
  try {
    snapshot = await src.read();
  } catch (e) {
    return { source: src.id, failure: { class: "read", error: errorMessage(e) } };
  }
  if (!snapshot.ok) return { source: src.id, failure: { class: "read", error: snapshot.error.message } };
  try {
    return { source: src.id, projection: src.project(snapshot.value, ctx) };
  } catch (e) {
    return { source: src.id, failure: { class: "project", error: errorMessage(e) } };
  }
}

/** Every source, read concurrently (each reader bounds its own fan-out). */
export function readAll(sources: readonly Source<unknown>[], ctx: ProjectCtx): Promise<Read[]> {
  return Promise.all(sources.map((s) => readOne(s, ctx)));
}

/** The facts the sync itself records about a source: a failure, a skipped record. */
function ingestFacts(source: string, ctx: ProjectCtx, failure: SourceReport["failed"], skipped: Projection["skipped"]): IngestEvent[] {
  const f = facts("ingest", ctx);
  const subject = { kind: "source", id: source };
  const out = skipped.map((s) =>
    f.observed(source, `skip.${seg(s.id)}.${digest(s.reason)}`, { actor: SYNC, type: "ingest.skip", subject, data: { record: s.id, reason: s.reason } }),
  );
  if (failure !== undefined) {
    out.push(f.observed(source, `fail.${failure.class}.${digest(failure.error)}`, { actor: SYNC, type: "ingest.fail", subject, data: { class: failure.class, error: failure.error } }));
  }
  return out;
}

type Counts = { appended: number; existing: number; drifted: number };

/** Append in batches of BATCH, one transaction each. Stops at the first refused batch. */
function appendAll(store: Store, events: readonly IngestEvent[], counts: Counts): string | null {
  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    const r = store.tx((t) => chunk.map((e) => appendOnce(t, e)));
    if (!r.ok) return r.error.message;
    for (const x of r.value) {
      if (x.appended) counts.appended++;
      else counts.existing++;
      if (!x.same) counts.drifted++;
    }
  }
  return null;
}

const sum = (m: Readonly<Record<string, number>>): number => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Read every source and append what the ledger does not hold yet. Always
 * resolves with a report; a source that failed is IN the report, with its
 * words. `err` only when the store itself could not record the outcome.
 */
export async function syncV1(store: Store, sources: readonly Source<unknown>[], ctx: ProjectCtx): Promise<Result<SyncReport>> {
  const reads = await readAll(sources, ctx);
  const reports: SourceReport[] = [];
  for (const r of reads) {
    const counts: Counts = { appended: 0, existing: 0, drifted: 0 };
    let failed: SourceReport["failed"] = "failure" in r ? r.failure : undefined;
    const p = "projection" in r ? r.projection : undefined;
    if (p !== undefined) {
      const refused = appendAll(store, p.events, counts);
      if (refused !== null) failed = { class: "append", error: refused };
    }
    // The sync's own facts go in after the source's, in their own batch, so a
    // refused batch above still leaves its failure on the record.
    const own: Counts = { appended: 0, existing: 0, drifted: 0 };
    const recorded = appendAll(store, ingestFacts(r.source, ctx, failed, p?.skipped ?? []), own);
    if (recorded !== null) return err("unavailable", `ledger-sync: cannot record ${r.source}'s outcome: ${recorded}`);
    const streak = recordSourceOutcome(store, r.source, failed === undefined ? null : `${failed.class}: ${failed.error}`);
    if (!streak.ok) return streak;
    reports.push({
      source: r.source,
      records: p === undefined ? 0 : sum(p.tally.records),
      events: p?.events.length ?? 0,
      ...counts,
      skipped: p?.skipped.length ?? 0,
      live: p?.live.length ?? 0,
      weir: p?.weir.length ?? 0,
      ...(failed === undefined ? {} : { failed }),
      streak: streak.value,
    });
  }
  return ok({
    at: ctx.now.toISOString(),
    universe: ctx.universe,
    sources: reports,
    appended: reports.reduce((n, s) => n + s.appended, 0),
    failed: reports.filter((s) => s.failed !== undefined).length,
  });
}

export type Difference = { readonly type: string; readonly v1: number; readonly ledger: number };

export type SourceReconcile = {
  readonly source: string;
  readonly ok: boolean;
  /** The v1 store's own count of each fact (Projection.tally.facts). */
  readonly tally: Readonly<Record<string, number>>;
  /** The ledger's events of this source, by type (the `source` column, the key's first segment). */
  readonly ledger: Readonly<Record<string, number>>;
  readonly records: Readonly<Record<string, number>>;
  readonly differences: readonly Difference[];
  readonly error?: string;
};

/**
 * Compare the ledger with each source's tally, type by type. The ledger may
 * hold MORE than the store today - history the store has since rewritten (an
 * old status, a flipped verdict, a journal line extract's cap dropped) - so
 * only a MISSING fact is a difference, unless `exact`: over a fresh store
 * synced once from a still universe, the two must be equal, and any surplus is
 * a key the projection minted twice or a fact the tally forgot.
 *
 * The clock is not a predicate here: both sides count every fact a source
 * holds, whenever it happened (audit-logging: audit-querying - say which
 * clock a count is on; this one is on none).
 */
export function reconcile(store: Store, reads: readonly Read[], exact: boolean): Result<{ readonly ok: boolean; readonly sources: readonly SourceReconcile[] }> {
  const sources: SourceReconcile[] = [];
  for (const r of reads) {
    if ("failure" in r) {
      sources.push({ source: r.source, ok: false, tally: {}, ledger: {}, records: {}, differences: [], error: `${r.failure.class}: ${r.failure.error}` });
      continue;
    }
    const counts = countEvents(store, { source: [r.source] });
    if (!counts.ok) return counts;
    const ledger = facetMap(counts.value, "type");
    const tally = r.projection.tally.facts;
    const differences: Difference[] = [];
    for (const type of [...new Set([...Object.keys(tally), ...Object.keys(ledger)])].sort()) {
      const v1 = tally[type] ?? 0;
      const held = ledger[type] ?? 0;
      if (exact ? held !== v1 : held < v1) differences.push({ type, v1, ledger: held });
    }
    sources.push({ source: r.source, ok: differences.length === 0, tally, ledger, records: r.projection.tally.records, differences });
  }
  return ok({ ok: sources.every((s) => s.ok), sources });
}

export type LiveRead = {
  readonly jobs: readonly LiveJob[];
  readonly weir: readonly WeirItem[];
  /** The Calendar's unsettled slots and the spend meter's open holds (wave B). */
  readonly slots: readonly LiveSlot[];
  readonly holds: readonly LiveHold[];
  /** Sources Runs could not read this time, with their words: drawn as gaps, never as "nothing running". */
  readonly failures: readonly { readonly source: string; readonly error: string }[];
};

/** A pile with its packet id, when its source has a decision adapter (./packet.ts). */
function withPacketId(w: WeirItem): WeirItem {
  const packetId = weirPacketId(w);
  return packetId === undefined ? w : { ...w, packetId };
}

/** v1's live work, read now, written nowhere (COMMON decision 4). */
export async function liveJobs(sources: readonly Source<unknown>[], ctx: ProjectCtx): Promise<LiveRead> {
  const reads = await readAll(sources, ctx);
  const jobs: LiveJob[] = [];
  const weir: WeirItem[] = [];
  const slots: LiveSlot[] = [];
  const holds: LiveHold[] = [];
  const failures: { source: string; error: string }[] = [];
  for (const r of reads) {
    if ("failure" in r) failures.push({ source: r.source, error: `${r.failure.class}: ${r.failure.error}` });
    else {
      jobs.push(...r.projection.live);
      // Every pile names the packet it opens as (Phase 3 decision 3): the Floor links it, the Board loads it.
      weir.push(...r.projection.weir.map((w) => withPacketId(w)));
      slots.push(...(r.projection.slots ?? []));
      holds.push(...(r.projection.holds ?? []));
    }
  }
  return { jobs, weir, slots, holds, failures };
}

export type Freshness = { readonly started: true } | { readonly started: false; readonly nextAt: string; readonly owner: string };

/**
 * Start a sync in the background if the claim is free; never await it. The
 * outcome is the ledger itself (and the claim row's report); a sync that throws
 * past syncV1's own net is logged and its claim lapses after SYNC_TTL_MS.
 */
export function syncSoon(store: Store, sources: readonly Source<unknown>[], ctx: ProjectCtx): Result<Freshness> {
  const owner = `${hostname()}/${process.pid}`;
  const claim = takeClaim(store, SYNC_CLAIM, owner, SYNC_TTL_MS);
  if (!claim.ok) return claim;
  if (!claim.value.won) return ok({ started: false, nextAt: claim.value.nextAt, owner: claim.value.owner });
  void syncV1(store, sources, ctx)
    .then((report) => {
      const done = finishClaim(store, SYNC_CLAIM, owner, SYNC_INTERVAL_MS, report.ok ? report.value : { error: report.error.message });
      if (!report.ok) console.error(`[ledger-sync] ${report.error.message}`);
      if (!done.ok) console.error(`[ledger-sync] the claim could not be closed: ${done.error.message}`);
    })
    .catch((e: unknown) => console.error(`[ledger-sync] failed outside its own report: ${errorMessage(e)}`));
  return ok({ started: true });
}

/** For a page that shows the ledger: start a sync of every v1 source if one is due. */
export function freshLedger(): Result<Freshness> {
  const k = kernel();
  if (!k.ok) return k;
  return syncSoon(k.value.store, V1_SOURCES, v1Ctx());
}

/** For Runs: every v1 source's live work and Weir piles, read at render time. */
export function liveNow(): Promise<LiveRead> {
  return liveJobs(V1_SOURCES, v1Ctx());
}
