import "server-only";

import { ok, type Result } from "@gt/domain/errors";
import type { ActorKind, Event } from "@gt/domain/event";
import { countEvents, type FacetCount } from "@gt/kernel/events-count";
import { queryEvents, type TimeCursor } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";
import { DAY_MS, daysBetween, dayKey, type DayCount } from "@gt/ui/components/timestrip/strip.ts";

import { hasPost, matchesPost, parseQuery, splitFilter, type KernelFilter, type LedgerFilter, type Post } from "./filter.ts";

// THE LEDGER'S READS - one module the page, the agents' JSONL route and the page's Server
// Actions all call, so the three can never disagree about what a filter returns.
//
// BOUNDED, AND IT SAYS SO (audit-logging: audit-querying; table: client-server-split).
//   · A page is PAGE rows in time order, continued by the kernel's (t, seq) cursor - keyset,
//     never offset, so a sync appending while someone reads shifts nothing.
//   · Counts (the total, every facet, every day of the strip) are the kernel's over the
//     WHOLE indexed filter, each facet with its own filter left out (events-count.ts).
//   · Free words and the `id: packet: style:` tokens have no index (events-query.ts:15-20:
//     a substring scan of `data` is not something an index serves). They are checked
//     against the rows the indexed filter returns, at most SCAN rows per page read, and the
//     answer carries `scanned` and `exhausted` so the page can say "searched N" instead of
//     presenting a partial scan as the whole truth. Counts do not apply them: a facet count
//     is a count of the indexed filter, and the page marks the text filter as page-local.
//   · One exception earns its own path: a lone word that IS a record's id (every
//     LedgerLink in the studio is `/ledger?q=<id>`). It is answered by two indexed reads -
//     subject id and run id - so "everything about this run" is complete at any age, where
//     a scan would stop at the newest SCAN rows. The prototype matched a word equal to a
//     known id exactly (ledger-data.js makeFilter); this keeps that meaning and makes it
//     an index lookup.

/** Rows sent to the browser per page. 34 px each, so about thirty screens of list. */
export const PAGE = 500;
/** The most rows one page read examines for an unindexed predicate. */
export const SCAN = 5000;
const SCAN_STEP = 1000;
/** Days the strip draws: twelve weeks to today and two after, hatched (the prototype drew 27 ahead). */
export const STRIP_PAST = 84;
export const STRIP_AHEAD = 14;

export type Page = {
  readonly events: readonly Event[];
  /** More rows match past this page. */
  readonly capped: boolean;
  readonly cursor?: TimeCursor;
  /** Rows examined for the unindexed part; equal to `events.length` when there is none. */
  readonly scanned: number;
  /** Every row the indexed filter holds past the cursor was examined. */
  readonly exhausted: boolean;
  /** The lone-id lookup answered this page. */
  readonly byId: boolean;
};

const cursorOf = (e: Event): TimeCursor => ({ t: e.occurredAt ?? e.at, seq: e.seq });
const later = (a: Event, b: Event): number => {
  const ta = a.occurredAt ?? a.at;
  const tb = b.occurredAt ?? b.at;
  return ta === tb ? a.seq - b.seq : ta < tb ? -1 : 1;
};

/** A lone word that may be an id: no spaces, no token prefix. Case kept - ids are case-sensitive. */
function loneId(f: LedgerFilter, post: Post): string | null {
  if (post.words.length !== 1 || post.id !== undefined || post.packet !== undefined || post.style !== undefined || post.projects !== undefined) return null;
  const raw = f.q.trim();
  return /\s/.test(raw) || parseQuery(raw).words.length !== 1 ? null : raw;
}

/**
 * The lone-id page: the id as a subject and as a run, merged. Null when the word names no
 * record under the filter - then it is a text word and the scan answers it. A continuation
 * (`cursor`) stays on this path whenever the word names a record at all, even with nothing
 * left past the cursor, so page 2 answers the same predicate page 1 did: never the text
 * scan, which would match every record whose id merely contains this one (`r1` in `r10`).
 */
function byIdPage(store: Store, kernel: KernelFilter, id: string, order: "asc" | "desc", cursor?: TimeCursor): Result<Page | null> {
  const base = { ...kernel, by: "time" as const, order, limit: PAGE, ...(cursor === undefined ? {} : { cursor }) };
  const bySubject = queryEvents(store, { ...base, subject: { ...kernel.subject, id } });
  if (!bySubject.ok) return bySubject;
  const byRun = queryEvents(store, { ...base, run: id });
  if (!byRun.ok) return byRun;
  const seen = new Map<number, Event>();
  for (const e of [...bySubject.value.events, ...byRun.value.events]) seen.set(e.seq, e);
  if (seen.size === 0) {
    if (cursor === undefined) return ok(null);
    const named = byIdPage(store, kernel, id, order);
    if (!named.ok) return named;
    return ok(named.value === null ? null : { events: [], capped: false, scanned: 0, exhausted: true, byId: true });
  }
  const merged = [...seen.values()].sort((a, b) => (order === "asc" ? later(a, b) : later(b, a)));
  const events = merged.slice(0, PAGE);
  // Each half read at most PAGE; the merge is complete only when neither was capped.
  const capped = bySubject.value.capped || byRun.value.capped || merged.length > PAGE;
  const last = events.at(-1);
  return ok({ events, capped, ...(capped && last !== undefined ? { cursor: cursorOf(last) } : {}), scanned: events.length, exhausted: !capped, byId: true });
}

/** One page of the filter in time order, continued from `cursor`. */
export function readPage(store: Store, f: LedgerFilter, cursor?: TimeCursor): Result<Page> {
  const { kernel, post } = splitFilter(f);
  const order = f.order;
  if (!hasPost(post)) {
    const r = queryEvents(store, { ...kernel, by: "time", order, limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!r.ok) return r;
    const { events, capped } = r.value;
    return ok({ events, capped, ...(r.value.cursor === undefined ? {} : { cursor: r.value.cursor }), scanned: events.length, exhausted: !capped, byId: false });
  }
  const id = loneId(f, post);
  if (id !== null) {
    const hit = byIdPage(store, kernel, id, order, cursor);
    if (!hit.ok) return hit;
    if (hit.value !== null) return ok(hit.value);
  }
  const matched: Event[] = [];
  let scanned = 0;
  let at = cursor;
  let more = true;
  let lastSeen: Event | undefined;
  while (more && matched.length <= PAGE && scanned < SCAN) {
    const r = queryEvents(store, { ...kernel, by: "time", order, limit: SCAN_STEP, ...(at === undefined ? {} : { cursor: at }) });
    if (!r.ok) return r;
    for (const e of r.value.events) {
      scanned++;
      lastSeen = e;
      if (matchesPost(e, post)) {
        matched.push(e);
        if (matched.length > PAGE) break;
      }
    }
    more = r.value.capped;
    at = r.value.cursor;
  }
  const events = matched.slice(0, PAGE);
  const overfull = matched.length > PAGE;
  const last = events.at(-1);
  // Overfull: continue after the last row shown. Stopped by the scan budget: continue after
  // the last row EXAMINED - every row before it was checked, matched or not.
  const next = overfull ? last : more ? lastSeen : undefined;
  return ok({ events, capped: overfull || more, ...(next === undefined ? {} : { cursor: cursorOf(next) }), scanned, exhausted: !more && !overfull, byId: false });
}

export type Facets = {
  readonly total: number;
  readonly head: number;
  readonly actor: Readonly<Record<ActorKind, number>> & { readonly all: number };
  readonly typeGroup: FacetCount;
  readonly type: FacetCount;
  readonly lane: FacetCount;
  readonly source: FacetCount;
  /** Each project the filter holds, counted on its own under the rest of the filter. */
  readonly project: Readonly<Record<string, number>>;
};

const facet = (all: readonly FacetCount[], name: FacetCount["facet"]): FacetCount =>
  all.find((x) => x.facet === name) ?? { facet: name, values: [], other: 0, truncated: false, none: 0 };

/** The total and every facet, each with its own filter left out (countEvents). */
export function readFacets(store: Store, f: LedgerFilter): Result<Facets> {
  const { kernel, post } = splitFilter(f);
  const r = countEvents(store, kernel);
  if (!r.ok) return r;
  // Project has no kernel facet (events-count.ts counts seven columns, project_id is not
  // one), and the kernel's `project` takes one value - several go to the rows (filter.ts).
  // So each held project is counted on its own under the rest of the filter: the other
  // facets' rule, one value at a time. One held project is the total itself.
  const held = post.projects ?? (kernel.project === undefined ? [] : [kernel.project]);
  const project: Record<string, number> = {};
  if (held.length === 1 && held[0] !== undefined) project[held[0]] = r.value.total;
  else {
    for (const pid of held) {
      const c = countEvents(store, { ...kernel, project: pid });
      if (!c.ok) return c;
      project[pid] = c.value.total;
    }
  }
  const all = r.value.facets;
  const kinds = facet(all, "actorKind");
  const n = (k: string): number => kinds.values.find((v) => v.value === k)?.n ?? 0;
  return ok({
    total: r.value.total,
    head: r.value.head,
    actor: { operator: n("operator"), agent: n("agent"), machine: n("machine"), all: kinds.values.reduce((a, v) => a + v.n, 0) + kinds.other },
    typeGroup: facet(all, "typeGroup"),
    type: facet(all, "type"),
    lane: facet(all, "lane"),
    source: facet(all, "source"),
    project,
  });
}

export type Strip = { readonly days: readonly DayCount[]; readonly today: string };

/**
 * Events per day under the filter minus its date range, split by actor kind. One count per
 * day up to today (later days are drawn empty and hatched), each the kernel's own count
 * over the day's half-open window - so a bar and the list a click on it opens can never
 * disagree. With an actor filter set the day's total belongs to the kinds it holds alone.
 */
export function readStrip(store: Store, f: LedgerFilter, nowMs: number): Result<Strip> {
  const today = dayKey(nowMs);
  const { kernel } = splitFilter({ ...f, from: null, to: null });
  const days = daysBetween(dayKey(nowMs - (STRIP_PAST - 1) * DAY_MS), dayKey(nowMs + STRIP_AHEAD * DAY_MS));
  // The actor facet counts with its own filter left out, so a kind the filter excludes still
  // has a count there; it is drawn as 0, or the bar would hold acts the list never shows.
  const held = kernel.actor?.kind;
  const out: DayCount[] = [];
  for (const day of days) {
    if (day > today) {
      out.push({ day, operator: 0, agent: 0, machine: 0 });
      continue;
    }
    const since = `${day}T00:00:00.000Z`;
    const until = new Date(Date.parse(since) + DAY_MS).toISOString();
    const c = countEvents(store, { ...kernel, since, until });
    if (!c.ok) return c;
    const kinds = facet(c.value.facets, "actorKind");
    const n = (k: ActorKind): number => (held !== undefined && !held.includes(k) ? 0 : (kinds.values.find((v) => v.value === k)?.n ?? 0));
    out.push({ day, operator: n("operator"), agent: n("agent"), machine: n("machine") });
  }
  return ok({ days: out, today });
}

/** One event by its seq, or null. */
export function readOne(store: Store, seq: number): Result<Event | null> {
  const r = queryEvents(store, { after: seq - 1, order: "asc", limit: 1 });
  if (!r.ok) return r;
  const e = r.value.events[0];
  return ok(e !== undefined && e.seq === seq ? e : null);
}

export const RELATED = 14;

export type Related = { readonly events: readonly Event[]; readonly total: number; readonly bySubject: number };

/**
 * Everything else about the same record (ledger.js `related`): the same subject, or the
 * same run. Counted exactly - |subject ∪ run| by inclusion-exclusion over three kernel
 * counts - and the newest RELATED drawn.
 */
export function readRelated(store: Store, e: Event): Result<Related> {
  const id = e.subject.id;
  const run = typeof e.data["runId"] === "string" ? e.data["runId"] : null;
  const cs = countEvents(store, { subject: { id } });
  if (!cs.ok) return cs;
  const s = queryEvents(store, { subject: { id }, by: "time", order: "desc", limit: RELATED + 1 });
  if (!s.ok) return s;
  let union = cs.value.total;
  const seen = new Map<number, Event>(s.value.events.map((x) => [x.seq, x]));
  if (run !== null) {
    const cr = countEvents(store, { run });
    if (!cr.ok) return cr;
    const both = countEvents(store, { run, subject: { id } });
    if (!both.ok) return both;
    union += cr.value.total - both.value.total;
    const r = queryEvents(store, { run, by: "time", order: "desc", limit: RELATED + 1 });
    if (!r.ok) return r;
    for (const x of r.value.events) seen.set(x.seq, x);
  }
  seen.delete(e.seq);
  const events = [...seen.values()].sort((a, b) => later(b, a)).slice(0, RELATED);
  return ok({ events, total: Math.max(0, union - 1), bySubject: Math.max(0, cs.value.total - 1) });
}

export type View = {
  readonly page: Page;
  readonly facets: Facets;
  readonly strip: Strip;
  /** The `ev` act, from this page or read on its own (a link to an old event). */
  readonly selected: Event | null;
  /** The clock every relative time and the strip's NOW were drawn against. */
  readonly nowMs: number;
};

/** Everything one render of the page reads, against one clock. */
export function readView(store: Store, f: LedgerFilter, nowMs: number = Date.now()): Result<View> {
  const page = readPage(store, f);
  if (!page.ok) return page;
  const facets = readFacets(store, f);
  if (!facets.ok) return facets;
  const strip = readStrip(store, f, nowMs);
  if (!strip.ok) return strip;
  const onPage = f.ev === null ? undefined : page.value.events.find((e) => e.seq === f.ev);
  let selected: Event | null = onPage ?? null;
  if (f.ev !== null && onPage === undefined) {
    const one = readOne(store, f.ev);
    if (!one.ok) return one;
    selected = one.value;
  }
  return ok({ page: page.value, facets: facets.value, strip: strip.value, selected, nowMs });
}

