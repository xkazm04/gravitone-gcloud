import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { ACTOR_KINDS, type Event } from "@gt/domain/event";
import { EVENT_COLUMNS, rowsToEvents, unwrap } from "./events.ts";
import type { Param, Store } from "./store.ts";

// READING THE LEDGER - the one query the Ledger route, `pipeline/ledger.mts
// query` and an agent all call (plan §4).
//
// The filter is the prototype's (docs/next/prototype/app/ledger-data.js
// `makeFilter`, whose URL hash carries actor, type, lane, from/to): actor kind
// (several at once, the segmented control), type exact or by group prefix
// (`job.*`, the facet's group rows), lane exact or by prefix (`channel.*`),
// subject (the detail panel's "history" button), and a time window. Dropped
// from the prototype, on purpose: the free-text `q` over notes and labels (no
// index can serve a substring scan of `data`; it returns as a search index when
// the Ledger route is built), `project` and `src` (fields of the prototype's
// derived rows, which live inside `data` here).
//
// A page says what it is (audit-logging: audit-querying): `capped` when more
// rows matched than the limit, `next` to continue in the same order, and
// `head`, the ledger's newest seq - so an empty page over a ledger with
// head 0 means "nothing was ever recorded", and an empty page with head > 0
// means "nothing matched".
//
// `since` is inclusive, `until` exclusive (half-open, so adjacent windows never
// count a row twice). Both filter on `at`, the ledger's one clock.

const MAX_LIMIT = 1000;
const PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*(\.\*)?$/;
const LANE = /^[^*]+(\.\*)?$/;

export const eventQuerySchema = z.object({
  actor: z.object({ kind: z.array(z.enum(ACTOR_KINDS)).min(1).optional(), id: z.string().min(1).optional() }).optional(),
  type: z.array(z.string().regex(PATTERN)).min(1).optional(),
  subject: z.object({ kind: z.string().min(1).optional(), id: z.string().min(1).optional() }).optional(),
  lane: z.array(z.string().regex(LANE)).min(1).optional(),
  since: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
  after: z.number().int().nonnegative().optional(),
  before: z.number().int().positive().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT),
});
export type EventQuery = z.input<typeof eventQuerySchema>;

export type EventPage = {
  readonly events: readonly Event[];
  /** The newest seq in the ledger, 0 when it is empty. */
  readonly head: number;
  /** More rows matched than `limit`. */
  readonly capped: boolean;
  /** Pass as `after` (asc) or `before` (desc) to read the next page. */
  readonly next?: number;
};

/**
 * One facet's values, OR-ed. `job.*` is the group column (an indexed equality,
 * already in seq order); a deeper prefix such as `publish.fail.*` is the
 * half-open range [publish.fail., publish.fail/) - '/' is the code unit after '.'.
 */
function anyOf(column: string, group: string, patterns: readonly string[], where: string[], params: Param[]): void {
  const parts: string[] = [];
  for (const p of patterns) {
    if (!p.endsWith(".*")) {
      parts.push(`${column} = ?`);
      params.push(p);
      continue;
    }
    const stem = p.slice(0, -2);
    if (!stem.includes(".")) {
      parts.push(`${group} = ?`);
      params.push(stem);
    } else {
      parts.push(`(${column} >= ? AND ${column} < ?)`);
      params.push(`${stem}.`, `${stem}/`);
    }
  }
  where.push(parts.length === 1 ? (parts[0] ?? "") : `(${parts.join(" OR ")})`);
}

type Parsed = z.output<typeof eventQuerySchema>;

function compile(q: Parsed): { sql: string; params: Param[] } {
  const where: string[] = [];
  const params: Param[] = [];
  const eq = (clause: string, v: Param): void => {
    where.push(clause);
    params.push(v);
  };
  if (q.actor?.kind !== undefined) {
    where.push(`actor_kind IN (${q.actor.kind.map(() => "?").join(", ")})`);
    params.push(...q.actor.kind);
  }
  if (q.actor?.id !== undefined) eq("actor_id = ?", q.actor.id);
  if (q.type !== undefined) anyOf("type", "type_group", q.type, where, params);
  if (q.lane !== undefined) anyOf("lane", "lane_group", q.lane, where, params);
  if (q.subject?.id !== undefined) eq("subject_id = ?", q.subject.id);
  if (q.subject?.kind !== undefined) eq("subject_kind = ?", q.subject.kind);
  if (q.since !== undefined) eq("at >= ?", q.since);
  if (q.until !== undefined) eq("at < ?", q.until);
  if (q.after !== undefined) eq("seq > ?", q.after);
  if (q.before !== undefined) eq("seq < ?", q.before);
  const filter = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const sql = `SELECT ${EVENT_COLUMNS} FROM events${filter} ORDER BY seq ${q.order === "asc" ? "ASC" : "DESC"} LIMIT ?`;
  // One row past the limit, so a full page can say whether it was capped.
  return { sql, params: [...params, q.limit + 1] };
}

export function queryEvents(store: Store, input: EventQuery): Result<EventPage> {
  const p = parseAt("ledger query", eventQuerySchema, input);
  if (!p.ok) return p;
  const { sql, params } = compile(p.value);
  const limit = p.value.limit;
  return store.read((r) => {
    const rows = r.all(sql, ...params);
    const capped = rows.length > limit;
    const events = unwrap(rowsToEvents(capped ? rows.slice(0, limit) : rows));
    const headSeq = r.get("SELECT coalesce(max(seq), 0) AS head FROM events")?.["head"];
    const last = events.at(-1);
    const page: EventPage = { events, head: typeof headSeq === "number" ? headSeq : 0, capped };
    return capped && last !== undefined ? { ...page, next: last.seq } : page;
  });
}

/**
 * The SSE cursor: every event after `seq`, oldest first, at most `limit`.
 * A subscriber keeps the last seq it saw and asks again; nothing is missed and
 * nothing repeats, because seq is gapless and assigned under the write lock.
 */
export function eventsAfter(store: Store, seq: number, limit = 500): Result<EventPage> {
  return queryEvents(store, { after: seq, order: "asc", limit });
}

/** The plan SQLite chooses for a query: the proof that a facet is served by an index. */
export function explainQuery(store: Store, input: EventQuery): Result<string[]> {
  const p = parseAt("ledger query", eventQuerySchema, input);
  if (!p.ok) return p;
  const { sql, params } = compile(p.value);
  return store.read((r) => r.all(`EXPLAIN QUERY PLAN ${sql}`, ...params).map((row) => String(row["detail"])));
}
