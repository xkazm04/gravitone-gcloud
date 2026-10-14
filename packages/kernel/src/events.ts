import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { eventDataSchema, eventInputSchema, eventSchema, type Event, type EventInput } from "@gt/domain/event";
import { canonical, chainHash, GENESIS_HASH } from "./canonical.ts";
import type { ModuleMigrations } from "./migrate.ts";
import type { Reader, Row, Store, Tx } from "./store.ts";

// THE LEDGER - every act, in the transaction that made it (plan §4).
//
// An outbox, not a log file: `append` takes a `Tx`, never a `Store`, so an
// event can only be written inside the transaction that changes the state it
// records. The two commit together or not at all; there is no window in which
// the ledger says something happened that the store does not hold, or the
// reverse. That makes the ledger a CONTROL record, not a best-effort one: a
// failed append fails the action (audit-logging names this inversion). v1 got
// the same guarantee one store at a time by ordering writes by hand
// (lib/sound/store.ts commits its ledger last, so a crash loses a judgement
// whole); here it is the database's atomicity, for every module at once.
//
// TAMPER-EVIDENT, not tamper-proof. Each row's `hash` is
// sha256(prevHash + canonical(row without hash)) - canonical.ts states the
// byte rules, and packages/kernel/py/verify_events.py re-derives them in
// Python. An edited row breaks its own link; a deleted one breaks the next.
// What the chain alone cannot see is a cut TAIL: drop the newest rows and
// what remains is a valid shorter chain. `verify` therefore takes an optional
// anchor (a seq and hash recorded somewhere else - an export, a commit) and
// reports a ledger that no longer reaches it.
//
// Covered fields (the hash's input, fixed): seq, at, actor{kind,id}, type,
// subject{kind,id}, lane, cost{usd,src}, data, prevHash. `lane` and `cost` are
// omitted from the input when absent (NULL in their columns), which is the
// record model's "absent is omitted" rule, and is deterministic either way.
//
// ONE CLOCK. `at` is when the ledger recorded the act (the transaction's
// instant; `seq` breaks ties). A fact learned after it happened - an import, a
// backfill - carries its own effective time inside `data`; a second indexed
// clock is added when the first such writer exists (audit-logging:
// two-clock-records), not before.
//
// APPEND-ONLY is enforced by the schema, not by politeness: UPDATE and DELETE
// on `events` raise. Retention, when it comes, trims at a checkpoint boundary
// and keeps the cut's digest, in a migration that says so.

export const eventsMigrations: ModuleMigrations = {
  module: "events",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE events (
  seq INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('operator', 'agent', 'machine')),
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  lane TEXT,
  cost_usd REAL,
  cost_src TEXT CHECK (cost_src IN ('real', 'model', 'illustrative')),
  data TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  type_group TEXT GENERATED ALWAYS AS (CASE WHEN instr(type, '.') > 0 THEN substr(type, 1, instr(type, '.') - 1) ELSE type END) VIRTUAL,
  lane_group TEXT GENERATED ALWAYS AS (CASE WHEN instr(lane, '.') > 0 THEN substr(lane, 1, instr(lane, '.') - 1) ELSE lane END) VIRTUAL,
  CHECK ((cost_usd IS NULL) = (cost_src IS NULL))
);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;`,
    },
    {
      // The Ledger page's facets (docs/next/prototype/app/ledger.js): actor,
      // type and its group (`job.*`), subject history, lane and its group
      // (`channel.*`), date range. Every page reads "newest N that match", so
      // each facet gets an index whose EQUALITY leaves rows in rowid (= seq)
      // order: the page walks the index backwards and stops at N, with no
      // sort. That is why a group is a generated column compared with `=`, not
      // a prefix range (a range over `type` would have to sort every match),
      // and why actor KIND has no index: three values select a third of the
      // table each, and the rowid walk with a filter stops sooner.
      version: 2,
      sql: `
CREATE INDEX events_type ON events (type);
CREATE INDEX events_type_group ON events (type_group);
CREATE INDEX events_actor ON events (actor_id);
CREATE INDEX events_subject ON events (subject_id);
CREATE INDEX events_lane ON events (lane) WHERE lane IS NOT NULL;
CREATE INDEX events_lane_group ON events (lane_group) WHERE lane_group IS NOT NULL;
CREATE INDEX events_at ON events (at);`,
    },
  ],
};

export const EVENT_COLUMNS = "seq, at, actor_kind, actor_id, type, subject_kind, subject_id, lane, cost_usd, cost_src, data, prev_hash, hash";

/** The hash input: the row without its hash, absent keys omitted. */
function bodyOf(e: Omit<Event, "hash">): Record<string, unknown> {
  const body: Record<string, unknown> = {
    seq: e.seq,
    at: e.at,
    actor: { kind: e.actor.kind, id: e.actor.id },
    type: e.type,
    subject: { kind: e.subject.kind, id: e.subject.id },
    data: e.data,
    prevHash: e.prevHash,
  };
  if (e.lane !== undefined) body["lane"] = e.lane;
  if (e.cost !== undefined) body["cost"] = { usd: e.cost.usd, src: e.cost.src };
  return body;
}

const headRow = z.object({ seq: z.number().int().positive(), hash: z.string() });

function head(r: Reader): { seq: number; hash: string } {
  const row = r.get("SELECT seq, hash FROM events ORDER BY seq DESC LIMIT 1");
  if (row === undefined) return { seq: 0, hash: GENESIS_HASH };
  const p = parseAt("events head", headRow, row);
  if (!p.ok) throw p.error;
  return p.value;
}

/**
 * Write one event inside the caller's transaction and return it. Throws
 * `AppError` (invalid input, unencodable data), which rolls the caller's
 * transaction back with it - the state change does not land without its event.
 */
export function append(t: Tx, input: EventInput): Event {
  const p = parseAt("event", eventInputSchema, input);
  if (!p.ok) throw p.error;
  const v = p.value;
  const prev = head(t);
  const draft: Omit<Event, "hash"> = { ...v, seq: prev.seq + 1, at: t.at, prevHash: prev.hash };
  const hash = chainHash(prev.hash, bodyOf(draft));
  t.run(
    `INSERT INTO events (${EVENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    draft.seq,
    draft.at,
    v.actor.kind,
    v.actor.id,
    v.type,
    v.subject.kind,
    v.subject.id,
    v.lane ?? null,
    v.cost?.usd ?? null,
    v.cost?.src ?? null,
    canonical(v.data),
    draft.prevHash,
    hash,
  );
  return { ...draft, hash };
}

/** A stored row back into an `Event`, through the door: a row a person or
 *  another process edited is data like any other. */
export function rowToEvent(row: Row): Result<Event> {
  const text = row["data"];
  if (typeof text !== "string") return err("invalid", `event row ${String(row["seq"])}: data is not text`);
  const data = parseJsonAt("event data", eventDataSchema, text);
  if (!data.ok) return data;
  const shaped: Record<string, unknown> = {
    seq: row["seq"],
    at: row["at"],
    actor: { kind: row["actor_kind"], id: row["actor_id"] },
    type: row["type"],
    subject: { kind: row["subject_kind"], id: row["subject_id"] },
    data: data.value,
    prevHash: row["prev_hash"],
    hash: row["hash"],
  };
  if (row["lane"] !== null) shaped["lane"] = row["lane"];
  if (row["cost_usd"] !== null) shaped["cost"] = { usd: row["cost_usd"], src: row["cost_src"] };
  return parseAt("event row", eventSchema, shaped);
}

export type ChainAnchor = { readonly seq: number; readonly hash: string };

export type VerifyReport =
  | { readonly state: "intact"; readonly count: number; readonly head: ChainAnchor | null }
  | { readonly state: "tampered"; readonly seq: number; readonly reason: string };

/** The pure half of verify: walk rows in seq order, report the first broken link. */
export function verifyRows(rows: Iterable<Row>, anchor?: ChainAnchor): VerifyReport {
  let prev: ChainAnchor = { seq: 0, hash: GENESIS_HASH };
  for (const row of rows) {
    const at = typeof row["seq"] === "number" ? row["seq"] : prev.seq + 1;
    const e = rowToEvent(row);
    if (!e.ok) return { state: "tampered", seq: at, reason: `unreadable: ${e.error.message}` };
    const ev = e.value;
    if (ev.seq !== prev.seq + 1) return { state: "tampered", seq: prev.seq + 1, reason: `missing: the next row is seq ${ev.seq}` };
    if (ev.prevHash !== prev.hash) return { state: "tampered", seq: ev.seq, reason: `prevHash does not match the hash of seq ${prev.seq}` };
    let expect: string;
    try {
      expect = chainHash(ev.prevHash, bodyOf(ev));
    } catch (cause) {
      return { state: "tampered", seq: ev.seq, reason: `unencodable: ${cause instanceof Error ? cause.message : String(cause)}` };
    }
    if (expect !== ev.hash) return { state: "tampered", seq: ev.seq, reason: "hash mismatch: the row's content changed after it was written" };
    if (anchor !== undefined && ev.seq === anchor.seq && ev.hash !== anchor.hash) {
      return { state: "tampered", seq: ev.seq, reason: "the row at the anchor's seq is not the anchored row" };
    }
    prev = { seq: ev.seq, hash: ev.hash };
  }
  if (anchor !== undefined && prev.seq < anchor.seq) {
    return { state: "tampered", seq: prev.seq + 1, reason: `truncated: the ledger ends at seq ${prev.seq}, the anchor is at ${anchor.seq}` };
  }
  return { state: "intact", count: prev.seq, head: prev.seq === 0 ? null : prev };
}

/** Re-derive the whole chain from the store. A store failure is an `err`; a
 *  broken chain is an `ok` report that says where. */
export function verify(store: Store, anchor?: ChainAnchor): Result<VerifyReport> {
  return store.read((r) => verifyRows(r.all(`SELECT ${EVENT_COLUMNS} FROM events ORDER BY seq`), anchor));
}

/** The newest link: what an export records as its anchor. */
export function chainHead(store: Store): Result<ChainAnchor | null> {
  return store.read((r) => {
    const h = head(r);
    return h.seq === 0 ? null : h;
  });
}

export function rowsToEvents(rows: readonly Row[]): Result<Event[]> {
  const out: Event[] = [];
  for (const row of rows) {
    const e = rowToEvent(row);
    if (!e.ok) return err("internal", `ledger: stored ${e.error.message}`, { cause: e.error });
    out.push(e.value);
  }
  return ok(out);
}

/** Thrown inside a read when a stored row will not parse; becomes the read's `err`. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}
