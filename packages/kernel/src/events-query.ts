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
// subject (the detail panel's "history" button, or several ids for "related"),
// the projection's source and project, and a time window. Dropped from the
// prototype, on purpose: the free-text `q` over notes and labels (no index can
// serve a substring scan of `data`; it returns as a search index when the
// Ledger route is built) and `src` (real|fixture, a field inside `data`).
//
// A page says what it is (audit-logging: audit-querying): `capped` when more
// rows matched than the limit, a continuation in the same order, and `head`,
// the ledger's newest seq - so an empty page over a ledger with head 0 means
// "nothing was ever recorded", and an empty page with head > 0 means "nothing
// matched".
//
// TWO ORDERS, ONE WINDOW CLOCK (audit-logging: record-axis-predicate). `since`
// is inclusive, `until` exclusive (half-open, so adjacent windows never count a
// row twice), and both filter on `t = occurredAt ?? at` - when the act
// happened, which for every kernel-made event is when it was recorded. The
// ORDER is the caller's: `by: "seq"` (the default; the SSE cursor and the
// chain's own order, continued with `after`/`before`) or `by: "time"` (the
// Ledger's reading order, continued with a `cursor` that is the tuple
// (t, seq) - a timestamp alone would skip or repeat the rows that share one,
// realtime-events: outbound-fan-out).

const MAX_LIMIT = 1000;
const MAX_IDS = 200;
const PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*(\.\*)?$/;
const LANE = /^[^*]+(\.\*)?$/;
const SOURCE = /^[a-z][a-z0-9-]*$/;

const cursorSchema = z.object({ t: z.iso.datetime(), seq: z.number().int().positive() });
export type TimeCursor = z.output<typeof cursorSchema>;

export const eventQuerySchema = z
  .object({
    actor: z.object({ kind: z.array(z.enum(ACTOR_KINDS)).min(1).optional(), id: z.string().min(1).optional() }).optional(),
    type: z.array(z.string().regex(PATTERN)).min(1).optional(),
    subject: z
      .object({ kind: z.string().min(1).optional(), id: z.string().min(1).optional(), ids: z.array(z.string().min(1)).min(1).max(MAX_IDS).optional() })
      .optional(),
    lane: z.array(z.string().regex(LANE)).min(1).optional(),
    /** The projection's source: the first segment of an event's natural key. */
    source: z.array(z.string().regex(SOURCE)).min(1).optional(),
    /** `data.projectId`, an indexed generated column (events v3). */
    project: z.string().min(1).optional(),
    /** `data.runId`, likewise: every act about a run, whatever its subject. */
    run: z.string().min(1).optional(),
    since: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    by: z.enum(["seq", "time"]).optional(),
    after: z.number().int().nonnegative().optional(),
    before: z.number().int().positive().optional(),
    cursor: cursorSchema.optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT),
  })
  .refine((q) => (q.by === "time" ? q.after === undefined && q.before === undefined : q.cursor === undefined), {
    message: "a seq cursor (after/before) goes with by:seq, a time cursor with by:time",
    path: ["by"],
  });
export type EventQuery = z.input<typeof eventQuerySchema>;
type Parsed = z.output<typeof eventQuerySchema>;

export type EventPage = {
  readonly events: readonly Event[];
  /** The newest seq in the ledger, 0 when it is empty. */
  readonly head: number;
  /** More rows matched than `limit`. */
  readonly capped: boolean;
  /** by:seq - pass as `after` (asc) or `before` (desc) to read the next page. */
  readonly next?: number;
  /** by:time - pass as `cursor` to read the next page. */
  readonly cursor?: TimeCursor;
};

/** The facets a count can leave out (countEvents). Every other predicate always applies. */
export type Facet = "actorKind" | "type" | "lane" | "subjectKind" | "source";

export type Clause = { readonly facet: Facet | null; readonly sql: string; readonly params: readonly Param[] };

/**
 * One facet's values, OR-ed. `job.*` is the group column (an indexed equality,
 * already in seq order); a deeper prefix such as `publish.fail.*` is the
 * half-open range [publish.fail., publish.fail/) - '/' is the code unit after '.'.
 */
function anyOf(facet: Facet, column: string, group: string, patterns: readonly string[]): Clause {
  const parts: string[] = [];
  const params: Param[] = [];
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
  return { facet, sql: parts.length === 1 ? (parts[0] ?? "") : `(${parts.join(" OR ")})`, params };
}

const marks = (n: number): string => Array.from({ length: n }, () => "?").join(", ");

/** Every predicate of `q`, each tagged with the facet it belongs to (or none). */
export function clausesOf(q: Parsed): Clause[] {
  const out: Clause[] = [];
  const eq = (facet: Facet | null, sql: string, ...params: Param[]): void => {
    out.push({ facet, sql, params });
  };
  if (q.actor?.kind !== undefined) eq("actorKind", `actor_kind IN (${marks(q.actor.kind.length)})`, ...q.actor.kind);
  if (q.actor?.id !== undefined) eq(null, "actor_id = ?", q.actor.id);
  if (q.type !== undefined) out.push(anyOf("type", "type", "type_group", q.type));
  if (q.lane !== undefined) out.push(anyOf("lane", "lane", "lane_group", q.lane));
  if (q.subject?.id !== undefined) eq(null, "subject_id = ?", q.subject.id);
  if (q.subject?.ids !== undefined) eq(null, `subject_id IN (${marks(q.subject.ids.length)})`, ...q.subject.ids);
  if (q.subject?.kind !== undefined) eq("subjectKind", "subject_kind = ?", q.subject.kind);
  if (q.source !== undefined) eq("source", `source IN (${marks(q.source.length)})`, ...q.source);
  if (q.project !== undefined) eq(null, "project_id = ?", q.project);
  if (q.run !== undefined) eq(null, "run_id = ?", q.run);
  if (q.since !== undefined) eq(null, "t >= ?", q.since);
  if (q.until !== undefined) eq(null, "t < ?", q.until);
  return out;
}

export function whereOf(clauses: readonly Clause[]): { where: string; params: Param[] } {
  if (clauses.length === 0) return { where: "", params: [] };
  return { where: ` WHERE ${clauses.map((c) => c.sql).join(" AND ")}`, params: clauses.flatMap((c) => [...c.params]) };
}

function compile(q: Parsed): { sql: string; params: Param[] } {
  const clauses = clausesOf(q);
  const asc = q.order === "asc";
  const eq = (sql: string, v: Param): void => {
    clauses.push({ facet: null, sql, params: [v] });
  };
  if (q.after !== undefined) eq("seq > ?", q.after);
  if (q.before !== undefined) eq("seq < ?", q.before);
  if (q.cursor !== undefined) clauses.push({ facet: null, sql: asc ? "(t, seq) > (?, ?)" : "(t, seq) < (?, ?)", params: [q.cursor.t, q.cursor.seq] });
  const { where, params } = whereOf(clauses);
  const dir = asc ? "ASC" : "DESC";
  const order = q.by === "time" ? `t ${dir}, seq ${dir}` : `seq ${dir}`;
  // One row past the limit, so a full page can say whether it was capped.
  return { sql: `SELECT ${EVENT_COLUMNS} FROM events${where} ORDER BY ${order} LIMIT ?`, params: [...params, q.limit + 1] };
}

export function queryEvents(store: Store, input: EventQuery): Result<EventPage> {
  const p = parseAt("ledger query", eventQuerySchema, input);
  if (!p.ok) return p;
  const { sql, params } = compile(p.value);
  const { limit, by } = p.value;
  return store.read((r) => {
    const rows = r.all(sql, ...params);
    const capped = rows.length > limit;
    const events = unwrap(rowsToEvents(capped ? rows.slice(0, limit) : rows));
    const headSeq = r.get("SELECT coalesce(max(seq), 0) AS head FROM events")?.["head"];
    const last = events.at(-1);
    const page: EventPage = { events, head: typeof headSeq === "number" ? headSeq : 0, capped };
    if (!capped || last === undefined) return page;
    return by === "time" ? { ...page, cursor: { t: last.occurredAt ?? last.at, seq: last.seq } } : { ...page, next: last.seq };
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
