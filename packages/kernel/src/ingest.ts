import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { eventInputSchema, type Event, type EventInput } from "@gt/domain/event";
import { canonical } from "./canonical.ts";
import { append, EVENT_COLUMNS, rowToEvent } from "./events.ts";
import type { ModuleMigrations } from "./migrate.ts";
import type { Store, Tx } from "./store.ts";

// INGEST - the kernel half of projecting another system's records into the
// ledger (Phase 2: every v1 store, read-only, as Events).
//
// IDEMPOTENT BY KEY, AND THE STORE SAYS SO. A projection is re-run on every
// sync over the same v1 files, so "append what you have not appended before"
// must survive a crashed sync, two processes syncing at once and an adapter
// that forgets what it did. v1's answer to the same problem was memory kept by
// hand next to the data (the catalogue journal's reused revision,
// lib/foundry/catalogue.ts; the MV queue's plan-from-missing-outputs,
// lib/sound/mv/queue.ts); here the event's natural key is a UNIQUE column
// (events v3), so a second append of one fact is refused by the database under
// the write lock, whoever attempts it (delivery-guarantees: idempotent
// consumer, the dedupe record committed with the effect).
//
// A KEY THAT COMES BACK WITH DIFFERENT CONTENT is not appended and not
// silently dropped either: the result says `same: false`. The chain is
// append-only, so a v1 record that changed must yield a NEW fact with a new
// key (COMMON decision 2); a key whose content moved means an adapter keyed a
// rewritable field as if it were write-once, and the sync reports it as drift
// instead of hiding it.
//
// THE SYNC CLAIM is a rate limit and a single-flight guard in one row, not a
// lease from ./lease.ts: a lease writes an Event per grant and per release, and
// a ledger that is synced every thirty seconds while somebody looks at it
// would fill with "the sync took the sync lease". A claim is one conditional
// write under BEGIN IMMEDIATE - two processes cannot both win it - with a TTL,
// so a sync that died mid-run is retried once the TTL passes.

export const ingestMigrations: ModuleMigrations = {
  module: "ingest",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE ingest_claims (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  next_at TEXT NOT NULL,
  finished_at TEXT,
  report TEXT
) WITHOUT ROWID;
CREATE TABLE ingest_sources (
  source TEXT PRIMARY KEY,
  last_ok_at TEXT,
  fail_streak INTEGER NOT NULL DEFAULT 0 CHECK (fail_streak >= 0),
  last_error TEXT,
  last_error_at TEXT
) WITHOUT ROWID;`,
    },
  ],
};

export type AppendOnce = {
  readonly event: Event;
  /** False when the key was already in the ledger: nothing was written. */
  readonly appended: boolean;
  /** False when the stored event under this key says something else (see the header). */
  readonly same: boolean;
};

/** The parts of an event a re-projection must reproduce. A `derived` instant
 *  is the sync's own clock, different on every run by construction, so it is
 *  left out; a `recorded` one is the source's and must not move. */
function identity(e: EventInput): string {
  return canonical({
    actor: e.actor,
    type: e.type,
    subject: e.subject,
    data: e.data,
    lane: e.lane ?? null,
    cost: e.cost ?? null,
    atSrc: e.atSrc ?? null,
    occurredAt: e.atSrc === "recorded" ? (e.occurredAt ?? null) : null,
  });
}

/**
 * Append `input` unless an event with its `key` exists; either way return the
 * event the ledger holds under that key. Throws `AppError` like `append`, so a
 * failure rolls the caller's batch back whole.
 */
export function appendOnce(t: Tx, input: EventInput & { readonly key: string }): AppendOnce {
  const p = parseAt("event", eventInputSchema, input);
  if (!p.ok) throw p.error;
  const row = t.get(`SELECT ${EVENT_COLUMNS} FROM events WHERE key = ?`, input.key);
  if (row === undefined) return { event: append(t, p.value), appended: true, same: true };
  const held = rowToEvent(row);
  if (!held.ok) throw new AppError("internal", `ingest: the event under key ${input.key} is unreadable: ${held.error.message}`, { cause: held.error });
  return { event: held.value, appended: false, same: identity(held.value) === identity(p.value) };
}

/** Is this key in the ledger? A read, for a caller that only counts. */
export function hasKey(store: Store, key: string): Result<boolean> {
  return store.read((r) => r.get("SELECT 1 AS hit FROM events WHERE key = ?", key) !== undefined);
}

const claimRow = z.object({ owner: z.string(), next_at: z.string() });

export type Claim = { readonly won: true } | { readonly won: false; readonly owner: string; readonly nextAt: string };

const plus = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();

/**
 * Take the named claim if nobody holds it and its interval has passed. A won
 * claim blocks every other claimant for `ttlMs` (the most a run may take
 * before it counts as dead); `finishClaim` then shortens that to the interval
 * after the finish. The instant is the store transaction's own.
 */
export function takeClaim(store: Store, name: string, owner: string, ttlMs: number): Result<Claim> {
  return store.tx((t): Claim => {
    const row = t.get("SELECT owner, next_at FROM ingest_claims WHERE name = ?", name);
    if (row !== undefined) {
      const p = parseAt("ingest claim", claimRow, row);
      if (!p.ok) throw p.error;
      if (t.at < p.value.next_at) return { won: false, owner: p.value.owner, nextAt: p.value.next_at };
    }
    t.run(
      "INSERT INTO ingest_claims (name, owner, claimed_at, next_at) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET owner = excluded.owner, claimed_at = excluded.claimed_at, next_at = excluded.next_at, finished_at = NULL, report = NULL",
      name,
      owner,
      t.at,
      plus(t.at, ttlMs),
    );
    return { won: true };
  });
}

/** Record how a claimed run ended and when the next may start. `report` is
 *  plain JSON (the sync's per-source table), kept for "when did it last run". */
export function finishClaim(store: Store, name: string, owner: string, intervalMs: number, report: unknown): Result<boolean> {
  return store.tx(
    (t) =>
      t.run("UPDATE ingest_claims SET finished_at = ?, next_at = ?, report = ? WHERE name = ? AND owner = ?", t.at, plus(t.at, intervalMs), canonical(report), name, owner)
        .changes > 0,
  );
}

const lastRow = z.object({ owner: z.string(), claimed_at: z.string(), next_at: z.string(), finished_at: z.string().nullable(), report: z.string().nullable() });
export type ClaimState = z.output<typeof lastRow>;

/** The claim's row as stored, or null when it was never taken. */
export function claimState(store: Store, name: string): Result<ClaimState | null> {
  return store.read((r) => {
    const row = r.get("SELECT owner, claimed_at, next_at, finished_at, report FROM ingest_claims WHERE name = ?", name);
    if (row === undefined) return null;
    const p = parseAt("ingest claim", lastRow, row);
    if (!p.ok) throw p.error;
    return p.value;
  });
}

// PER-SOURCE HEALTH. A failing source's `ingest.fail` event is keyed by the
// error's digest, so a store that stays broken writes ONE event, not one per
// sync - and that dedupe would hide the count (delivery-guarantees:
// retry-escalation). The streak lives here instead: how many syncs in a row
// this source failed, cleared by the next success.

const sourceRow = z.object({
  source: z.string(),
  last_ok_at: z.string().nullable(),
  fail_streak: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  last_error_at: z.string().nullable(),
});
export type SourceHealth = z.output<typeof sourceRow>;

/** Record one sync's outcome for `source`; returns the streak after it. */
export function recordSourceOutcome(store: Store, source: string, error: string | null): Result<number> {
  return store.tx((t) => {
    if (error === null) {
      t.run(
        "INSERT INTO ingest_sources (source, last_ok_at, fail_streak) VALUES (?, ?, 0) ON CONFLICT (source) DO UPDATE SET last_ok_at = excluded.last_ok_at, fail_streak = 0",
        source,
        t.at,
      );
      return 0;
    }
    t.run(
      "INSERT INTO ingest_sources (source, fail_streak, last_error, last_error_at) VALUES (?, 1, ?, ?) ON CONFLICT (source) DO UPDATE SET fail_streak = fail_streak + 1, last_error = excluded.last_error, last_error_at = excluded.last_error_at",
      source,
      error,
      t.at,
    );
    const n = t.get("SELECT fail_streak FROM ingest_sources WHERE source = ?", source)?.["fail_streak"];
    return typeof n === "number" ? n : 1;
  });
}

/** Every source's health row, by name. */
export function sourceHealth(store: Store): Result<SourceHealth[]> {
  return store.read((r) =>
    r.all("SELECT source, last_ok_at, fail_streak, last_error, last_error_at FROM ingest_sources ORDER BY source").map((row) => {
      const p = parseAt("ingest source", sourceRow, row);
      if (!p.ok) throw p.error;
      return p.value;
    }),
  );
}
